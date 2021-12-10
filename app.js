const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, execSync } = require('child_process');

const configDir = path.resolve('./config.json');

let config = (() => {
    try {
        return JSON.parse(fs.readFileSync(configDir), 'utf-8');
    } catch {
        return {
            download: [],
        };
    }
})();

let mainWindow = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 780,
        height: 480,
        show: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'render.js')
        }
    })
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('select_directory', (event) => {
    dialog.showOpenDialog({ properties: ['openFile', 'openDirectory'] }).then(item => {
        if (!item.canceled && item.filePaths[0]) {
            event.sender.send('select_directory', item.filePaths[0]);
        }
    })
});

ipcMain.on('update_direction', (event, data) => {
    config.direction = data;
})

// 新增
ipcMain.on('push_download', (event, data) => {
    config.download.push(JSON.parse(data));
    sendRender(event);
    download();
})

// 暂停
ipcMain.on('update_download_status', (event, index) => {
    config.download[index].paused = !config.download[index].paused;
    sendRender(event);
    download();
})
// 删除
ipcMain.on('delete_download', (event, index) => {
    const [item] = config.download.splice(index, 1);
    if (item) {
        const link = `${path.resolve('temp')}/${item.temp}`;
        fs.rmSync(link, {
            force: true,
            recursive: true, // 递归删除
        });
    }
    sendRender(event);
    download();
})

ipcMain.on('render', (event) => {
    sendRender(event);
});

// 出发消息，传入direction
ipcMain.on('get_direction', (event) => {
    event.sender.send('update_direction', config.direction || '');
});

ipcMain.on('set_ffmpeg', (event) => {
    const result = execSync('ffmpeg -version').toString();
    if (result.includes('ffmpeg version')) {
        event.sender.send('ffmpeg_success');
        return;
    }
    const dir = path.resolve('lib');
    exec(`cd ${dir} && tar zxvf yasm.tar.gz && cd yasm && ./configure && sudo make && sudo make install`);
    exec(`cd ${dir} && tar zxvf lame.tar.gz && cd lame && ./configure && make && make install`);
    exec(`cd ${dir} && tar zxvf ffmpeg.tar.gz && cd ffmpeg && ./configure && make && sudo make install`, () => {
        if (event.sender && event.sender.send) {
            event.sender.send('ffmpeg_success');
        }
    });
})

function sendRender(event) {
    event.sender.send('render_html', JSON.stringify(config));
    fs.writeFileSync(configDir, JSON.stringify(config));
}

const downloading = {};

const downloaditem = (item) => {
    if (downloading[item.link + item.filename]) {
        return;
    }

    downloading[item.link + item.filename] = true;

    const load = () => {
        if (item.paused) {
            downloading[item.link + item.filename] = false;
            return;
        }
        if (item.source) {
            if (item.source.length === 0) {
                item.downloaded = true;
                item.process = '合成中';
                merge(item, false);
                return;
            }
            item.process = Math.round((item.total - item.source.length) / item.total * 10000) / 100 + '%';
            const list = item.source.splice(0, 5);
            Promise.allSettled(list.map(name => axios.get(`${item.sourcedir}/${name}`, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }))).then(content => {
                content.forEach((result, idx) => {
                    if (result.status === 'fulfilled' && result.value.status === 200) {
                        if (fs.existsSync(item.dirname)) {
                            fs.writeFileSync(`${item.dirname}/${list[idx]}`, result.value.data);
                        }
                    } else {
                        item.source.push(list[idx]);
                    }
                });
                load();
            }).catch((err) => {
                item.source.push(...list);
                load();
                console.log(err);
            })
        } else {
            axios({
                method: 'GET',
                url: item.link
            }).then(({ data = '' }) => {
                item.source = `${data}`.match(/\w+\.ts/g) || [];
                item.dirname = `${path.resolve('temp')}/${item.temp}/`;
                item.sourcedir = path.dirname(item.link);
                item.total = item.source.length;
                // 写入合并文件
                if (!fs.existsSync(item.dirname)) {
                    fs.mkdirSync(item.dirname, {
                        recursive: true,
                    });
                }
                const source = item.source.map(name => `file ${name}`);
                source.unshift("ffconcat version 1.0");
                fs.writeFileSync(`${item.dirname}combine.txt`, source.join('\n'));
                load();
            }).catch(() => {
                item.error = true;
                item.process = '下载出错';
            });
        }
    }
    load();
}

const download = () => {
    const split = 1;
    const list = config.download.filter(item => !item.downloaded && !item.paused && !item.completed);
    list.length = list.length > split ? split : list.length;
    list.forEach(downloaditem);
}

download();

const mergeing = {};

const merge = (item, node) => {
    if (mergeing[item.link + item.filename] || item.completed) {
        return;
    }

    mergeing[item.link + item.filename] = true;
    const result = execSync('ffmpeg -version').toString();
    const link = `${path.resolve('temp')}/${item.temp}`;
    const outlink = path.normalize(`${config.direction}/${item.filename}`);
    if (result.includes('ffmpeg version') && !node) {
        exec(`cd ${link} && ffmpeg -i combine.txt -acodec copy -vcodec copy -absf aac_adtstoasc ${outlink}`, (err, result) => {
            if (!err) {
                downloading[item.link + item.filename] = false;
                mergeing[item.link + item.filename] = false;
                item.completed = true;
                item.process = '100%';
                const removelink = `${path.resolve('temp')}/${item.temp}`;
                fs.rmSync(removelink, {
                    force: true,
                    recursive: true, // 递归删除
                });
            } else {
                merge(item, true);
            }
        })
    } else {
        const source = fs.readFileSync(`${item.dirname}combine.txt`, 'utf-8').split('\n').splice(1);
        const combine = () => {
            if (source.length === 0) {
                downloading[item.link + item.filename] = false;
                mergeing[item.link + item.filename] = false;
                item.completed = true;
                item.process = '100%';

                const removelink = `${path.resolve('temp')}/${item.temp}`;
                fs.rmSync(removelink, {
                    force: true,
                    recursive: true, // 递归删除
                });
                return;
            }
            const [name] = source.splice(0, 1);
            if (name) {
                const inlink = `${path.resolve('temp')}/${item.temp}/${name.replace('file ', '')}`;
                const content = fs.readFileSync(inlink);
                const outlink = path.normalize(`${config.direction}/${item.filename}`);
                fs.appendFileSync(outlink, content);
            }
            combine();
        }
        combine();
    }
}
