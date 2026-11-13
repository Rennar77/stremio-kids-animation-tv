const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 7000;

// Both Kids and Animation playlists from iptv-org
const PLAYLIST_URLS = [
    'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'https://iptv-org.github.io/iptv/categories/animation.m3u'
];

const MANIFEST = {
    id: 'community.local.kidsanimationtv',
    version: '1.1.0',
    name: 'Kids & Animation Live TV',
    description: 'Custom cloud Stremio addon for kids and animation channels',
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    catalogs: [
        {
            type: 'tv',
            id: 'kids_animation_tv',
            name: 'Kids & Animation TV',
        }
    ],
    idPrefixes: ['katv:']
};

let cachedChannels = [];

async function refreshChannels() {
    try {
        let allChannels = [];
        for (const url of PLAYLIST_URLS) {
            const response = await axios.get(url, { timeout: 10000 });
            const lines = response.data.split('\n');
            let currentChannel = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXTINF:')) {
                    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                    const nameParts = line.split(',');
                    const name = nameParts[nameParts.length - 1].trim();
                    
                    currentChannel = {
                        name: name || 'Unknown Channel',
                        poster: logoMatch ? logoMatch[1] : 'https://via.placeholder.com/300x450.png?text=Kids+TV'
                    };
                } else if (line.startsWith('http') && currentChannel.name) {
                    const slug = currentChannel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    allChannels.push({
                        id: `${slug}-${allChannels.length}`,
                        name: currentChannel.name,
                        poster: currentChannel.poster,
                        url: line
                    });
                    currentChannel = {};
                }
            }
        }
        cachedChannels = allChannels.slice(0, 350); // Combined channel cap
        console.log(`[INIT] Successfully loaded ${cachedChannels.length} kids & animation channels.`);
    } catch (error) {
        console.error('[PLAYLIST ERROR]:', error.message);
    }
}

// Fetch channels on startup and every 2 hours
refreshChannels();
setInterval(refreshChannels, 2 * 60 * 60 * 1000);

app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(MANIFEST);
});

app.get('/catalog/tv/kids_animation_tv.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const metas = cachedChannels.map(channel => ({
        id: `katv:${channel.id}`,
        type: 'tv',
        name: channel.name,
        poster: channel.poster,
        description: `Live broadcast: ${channel.name}`
    }));
    res.json({ metas });
});

app.get('/meta/tv/:id.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const cleanId = req.params.id.replace('katv:', '').replace('.json', '');
    const found = cachedChannels.find(c => c.id === cleanId);

    if (found) {
        return res.json({
            meta: {
                id: `katv:${found.id}`,
                type: 'tv',
                name: found.name,
                poster: found.poster,
                description: `Live broadcast stream for ${found.name}`
            }
        });
    }
    res.json({ meta: null });
});

app.get('/stream/tv/:id.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const cleanId = req.params.id.replace('katv:', '').replace('.json', '');
    const found = cachedChannels.find(c => c.id === cleanId);

    if (found && found.url) {
        return res.json({
            streams: [
                {
                    title: `${found.name} (Direct HD)`,
                    url: found.url
                }
            ]
        });
    }
    res.json({ streams: [] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Addon running on port ${PORT}`);
});