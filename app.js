const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const fetch = require('./fetch');

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

ipcMain.on('push_download', (event, data) => {
    config.download.push(JSON.parse(data));
    sendRender(event);
})

ipcMain.on('update_download_status', (event, index) => {
    config.download[index].paused = !config.download[index].paused;
    sendRender(event);
})

ipcMain.on('delete_download', (event, index) => {
    const [item] = config.download.splice(index, 1);
    if (item) {
        const link = `${path.resolve('temp')}/${item.temp}`;
        if (fs.existsSync(link)) {
            fs.rmdirSync(link, {
                recursive: true, // 递归删除
            });
        }
    }
    sendRender(event);
})

ipcMain.on('render', (event) => {
    sendRender(event);
})



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

const download = () => {
    const split = 3;
    const list = config.download.filter(item => !item.downloaded);
    list.length = list.length > split ? split : list.length;
    list.forEach(item => {
        // 暂停状态 完成状态 进行中 出错
        if (item.paused || item.downloaded || item.loading || item.error) {
            return;
        }
        if (item.init) {
            item.downloaded = item.source.length === item.finish.length;
            if (item.downloaded) {
                return;
            }
            if (item.finish.length % split !== 0) {
                return;
            }
            const target = item.source.slice(item.finish.length, item.finish.length + split);
            target.forEach(name => {
                const link = `${item.dirname}/${name}`;
                fetch.get(link, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }).then(content => {
                    item.finish.push(name);
                    item.process = Math.round(item.finish.length / (item.source.length + item.fail.length) * 100) + '%';
                    const link = `${path.resolve('temp')}/${item.temp}/`;
                    if (!fs.existsSync(link)) {
                        fs.mkdirSync(link, {
                            recursive: true,
                        });
                    }
                    fs.writeFileSync(`${link}${name}`, content);
                }).catch((err) => {
                    item.fail.push(name);
                    item.error = true;
                    console.log('出错', err);
                })
            })
        } else {
            item.loading = true;
            fetch.get(item.link).then(content => {
                item.init = true;
                item.loading = false;
                item.finish = [];
                item.fail = [];
                item.source = `${content}`.match(/\w+\.ts/g) || [];
                item.dirname = path.dirname(item.link);
            }).catch((err) => {
                item.error = true;
                console.log('错误', err);
            });
        }
    });
    setTimeout(download, 3000);
}

download();

const mergeing = {};

const merge = (item) => {
    if (mergeing[item.link + item.filename]) {
        return;
    }
    mergeing[item.link + item.filename] = true;
    const combine = () => {
        if (item.source.length === 0) {
            item.completed = true;
            mergeing[item.link + item.filename] = false;
            const link = `${path.resolve('temp')}/${item.temp}`;
            setTimeout(() => {
                if (fs.existsSync(link)) {
                    fs.rmdirSync(link, {
                        recursive: true, // 递归删除
                    });
                }
            }, 3000)
            return;
        }
        try {
            const name = item.source.splice(0, 1);
            const inlink = `${path.resolve('temp')}/${item.temp}/${name}`;
            const content = fs.readFileSync(inlink);
            const outlink = path.normalize(`${config.direction}/${item.filename}`);
            fs.appendFileSync(outlink, content);
            fs.unlinkSync(inlink);
        } catch {

        }
        combine();
    }
    combine();
}

const combine = () => {
    const list = config.download.filter(item => item.downloaded && !item.completed);
    list.forEach(item => {
        item.finish = [];
        merge(item);
    })
    setTimeout(download, 3000);
}
combine();
