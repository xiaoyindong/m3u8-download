

document.querySelector('#set_button').onclick = () => {
    document.querySelector('#mask').style.display = 'block';
    document.querySelector('#set_modal').style.display = 'block';
}

document.querySelector('#add_new_task_button').onclick = () => {
    document.querySelector('#mask').style.display = 'block';
    document.querySelector('#new_task_modal').style.display = 'block';
}

document.querySelectorAll('.cancel_modal').forEach(item => {
    item.onclick = () => {
        document.querySelector('#mask').style.display = 'none';
        document.querySelector('#set_modal').style.display = 'none';
        document.querySelector('#new_task_modal').style.display = 'none';
    }
})
