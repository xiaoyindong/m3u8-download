const path = require('path');
const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    const dirctionInput = document.querySelector('#directory_input');

    document.querySelector('#set_ffmpeg').onclick = () => {
        ipcRenderer.send('set_ffmpeg');
    }

    document.querySelector('#directory_make').onclick = () => {
        const value = dirctionInput.value.trim();
        if (value) {
            ipcRenderer.send('update_direction', value);
        }
        document.querySelector('#mask').style.display = 'none';
        document.querySelector('#set_modal').style.display = 'none';
        document.querySelector('#new_task_modal').style.display = 'none';
    }

    // 选择地址
    document.querySelector('#select_directory').onclick = () => {
        ipcRenderer.send('select_directory');
    }
    // 接收地址
    ipcRenderer.on('select_directory', (event, data) => {
        if (data.includes('.')) {
            dirctionInput.value = path.dirname(data);
        } else {
            dirctionInput.value = data;
        }
    });
    // 新建下载
    const linkInput = document.querySelector('#download_link');
    const filenameInput = document.querySelector('#download_filename');
    document.querySelector('#download_make').onclick = () => {
        const link = linkInput.value.trim();
        const filename = filenameInput.value.trim();
        if (link && filename) {
            ipcRenderer.send('push_download', JSON.stringify({
                link,
                filename: /\w+\.\w/.test(filename) ? filename : `${filename}.mp4`,
                paused: false,
                process: '0%',
                temp: Date.now(),
            }));
            document.querySelector('#mask').style.display = 'none';
            document.querySelector('#set_modal').style.display = 'none';
            document.querySelector('#new_task_modal').style.display = 'none';
        }
    }
    // render
    const listEle = document.querySelector('#download_list');
    listEle.onclick = (event) => {
        const target = event.target;
        if (target.dataset.type === '1') { // 暂停
            ipcRenderer.send('update_download_status', target.dataset.index);
        } else if (target.dataset.type === '2') { // 删除
            ipcRenderer.send('delete_download', target.dataset.index);
        }
    }

    ipcRenderer.on('render_html', (event, data) => {
        render(JSON.parse(data).download || []);
    })
    ipcRenderer.on('ffmpeg_success', () => {
        document.querySelector('#set_ffmpeg').innerText = '已安装';
    })
    
    function render(download) {
        let str = '';
        download.forEach((item, idx) => {
            let text = '';
            if (item.paused) {
                text = `<span data-type="1" data-index="${idx}">继续</span>`;''
            } else {
                text = `<span data-type="1" data-index="${idx}">暂停</span>`;''
            }
            if (item.downloaded) {
                text = `<span data-type="3" data-index="${idx}" style="color: yellow">合成</span>`
            }
            if (item.completed) {
                text = `<span data-type="4" data-index="${idx}" style="color: green">完成</span>`
            }
            str += `<div class="content_line">
            <div>${idx + 1}</div>
            <div>${item.filename}</div>
            <div class="process">${item.process}</div>
            <div class="action">${text}<span data-type="2" data-index="${idx}">删除</span></div>
        </div>`
        })
        listEle.innerHTML = str;
    }
    const update = () => {
        setTimeout(() => {
            update();
        }, 800);
        ipcRenderer.send('render');
    }
    update();
})
