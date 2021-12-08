const http = require('http');
const https = require('https');
const urllib = require('url');

module.exports = {
    get: async (url, options = {}) => {
        return new Promise((resolve, reject) => {
            const req = (url.startsWith('https://') ? https : http).request({
                ...urllib.parse(url, false),
                ...options
            }, (res) => {
                let chunks = [];
                res.on('data', (data) => {
                    chunks.push(data);
                });
                res.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
            });
            req.on('error', (e) => {
                reject(e);
            });
            req.end();
        })
    }
}