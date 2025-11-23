let plantilla_left_sidebar = null;

// document permanent elements
const mainContent = document.getElementById('note-editor');
const leftSidebar = document.getElementById('file-tree');


async function createNoteOrDir() {
    const createName = prompt("Insertar nombre del fichero (.md) o directorio:");

    if (!createName) {
        console.log("Operación cancelada por el usuario.");
        return false; 
    }

    try {
        const endpoint = `/api/create?path=${window.location.pathname}&name=${createName}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error('Network response was not ok');

        renderLeftSidebar();

        return true;
    } catch (err) {
        console.error('No se ha podido guardar', err);
        return false;
    }
}

async function trashContent() {
    if (window.location.pathname==="/") return;

    const isConfirmed = confirm("Seguro que quieres eliminar?");

    if (!isConfirmed) {
        console.log("Operación cancelada por el usuario.");
        return false; 
    }

    try {
        const endpoint = `/api/trash?path=${window.location.pathname}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error('Network response was not ok');

        const curLocationParts = window.location.pathname.split('/');
        curLocationParts.pop();
        const newLocation = '/' + curLocationParts.join('/');

        window.location.href = newLocation;

        return true;
    } catch (err) {
        console.error('No se ha podido guardar', err);
        return false;
    }
}

async function renderLeftSidebar() {
    let dirtree;
    try {
        var endpoint;
        if (window.location.pathname.length>1) endpoint = `/api/tree?path=${window.location.pathname}`;
        else endpoint = '/api/tree';
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Network response was not ok');
        dirtree = await response.json();
    } catch (err) {
        console.error('No se ha podido cargar la barra lateral', err);
        return;
    }

    let upbutton = window.location.pathname;
    let filename;
    if (upbutton!=='/') {
        let segments = upbutton.split('/');
        filename = segments.pop();
        if (segments.length>1) upbutton = segments.join('/');
        else upbutton = '/'
    } else {
        upbutton = '';
    }

    let renderedHtml = nunjucks.renderString(plantilla_left_sidebar, { dirtree, upbutton });
    leftSidebar.innerHTML = renderedHtml;

    document.querySelectorAll('.file-item').forEach(element => {
        if (element.getAttribute('data-path')===window.location.pathname) {
            element.classList.add('active');
        }
    });
}

function openImage(path) {
    if (window.location.pathname!=='/') {
        window.open(window.location.pathname + path, '_blank');
    } else {
        window.open(path, '_blank');
    }    
}

document.addEventListener('DOMContentLoaded', async function() {
    // searchInput.value = '';

    // cargar plantillas
    try {
        response = await fetch('/api/templates?path=left-sidebar.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_left_sidebar = await response.text();
    } catch (err) {
        console.error('No se han podido cargar las plantillas', err);
        document.getElementById('main-content').innerHTML = 'No se ha podido cargar la app';
        return;
    }
    
    renderLeftSidebar();
});
