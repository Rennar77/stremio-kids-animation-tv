const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 7000;

const PLAYLIST_URLS = [
    'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'https://iptv-org.github.io/iptv/categories/animation.m3u'
];

const MANIFEST = {
    id: 'community.local.kidsanimationtv',
    version: '1.3.0',
    name: 'Kids & Animation Live TV',
    description: 'Stable HTTPS cloud addon with persistent IDs',
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
                } else if (line.startsWith('https://') && currentChannel.name) {
                    // Generate a permanent unique ID based on the stream URL itself
                    const stableId = crypto.createHash('md5').update(line).digest('hex').substring(0, 10);
                    allChannels.push({
                        id: stableId,
                        name: currentChannel.name,
                        poster: currentChannel.poster,
                        url: line
                    });
                    currentChannel = {};
                }
            }
        }
        cachedChannels = allChannels.slice(0, 350);
        console.log(`[INIT] Loaded ${cachedChannels.length} stable HTTPS channels.`);
    } catch (error) {
        console.error('[PLAYLIST ERROR]:', error.message);
    }
}

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
        description: `Live secure broadcast: ${channel.name}`
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
                description: `Live secure broadcast stream for ${found.name}`
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
                    title: `${found.name} (Secure HD)`,
                    url: found.url
                }
            ]
        });
    }
    res.json({ streams: [] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stable addon running on port ${PORT}`);
});