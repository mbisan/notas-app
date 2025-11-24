const { Marked } = window.marked;
const { markedHighlight } = window.markedHighlight;

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

let plantilla_main_content = null;
let plantilla_left_sidebar = null;
let plantilla_right_sidebar = null;
const MAX_HISTORY_SIZE = 50;
let historial_contenido = [];
let historial_index = -1;
let contenido = null;
let currentEditor = null;
let editingBlockId = null;
let previousHTMLcontent = null;
let isSaving = false;
let lastQueryString = window.location.search;
let deleteOp = false;

// document permanent elements
const mainContent = document.getElementById('note-editor');
const leftSidebar = document.getElementById('file-tree');
const rightSidebar = document.getElementById('toc-list');

function setupCodeMirror(containerElement, content) {
    if (currentEditor) {
        currentEditor=null;
    }

    containerElement.innerHTML = '';

    CodeMirrorSpellChecker({
        codeMirrorInstance: CodeMirror,
    });

    const editor = CodeMirror(containerElement, {
        value: content,
        mode: 'spell-checker',
        backdrop: 'gfm',
        theme: '3024-night',
        lineNumbers: true,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        extraKeys: {
            'Ctrl-Enter': saveBlock,
            'Shift-Enter': saveBlock
        }
    });
    
    editor.setSize(null, 'auto');

    editor.on('paste', function(cm, event) {
        handlePaste(cm, event);
    });

    editor.on('inputRead', function(cm, change) {
        const cursor = cm.getCursor();
        const token = cm.getTokenAt(cursor);

        if (token.string.startsWith('/') && cursor.ch === token.end) {
            CodeMirror.showHint(cm, slashHint, { completeSingle: false });
        }
    });

    editor.on('blur', () => {
        setTimeout(saveBlock, 200);
    });
    
    currentEditor = editor;
    return editor;
}

async function slashHint(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);

    // Si el cursor está justo después del carácter '/'
    if (token.string.startsWith('/') && cursor.ch === token.end) {
        const currentText = token.string.substring(1).toLowerCase();
        const list = [
            {
                text: '/python',
                displayText: '/python - bloque de python',
                hint: function(cm, data, completion) {
                    const from = CodeMirror.Pos(cursor.line, cursor.ch - token.string.length);                    
                    const codeBlock = '```python\n\n```';
                    cm.replaceRange(codeBlock, from, cursor);

                    const newCursorPos = CodeMirror.Pos(cursor.line + 1, 0); 
                    cm.setCursor(newCursorPos);
                }
            },
            {
                text: '/sql',
                displayText: '/sql - bloque de sql',
                hint: function(cm, data, completion) {
                    const from = CodeMirror.Pos(cursor.line, cursor.ch - token.string.length);                    
                    const codeBlock = '```sql\n\n```';
                    cm.replaceRange(codeBlock, from, cursor);

                    const newCursorPos = CodeMirror.Pos(cursor.line + 1, 0); 
                    cm.setCursor(newCursorPos);
                }
            },
            {
                text: '/bash',
                displayText: '/bash - bloque de bash',
                hint: function(cm, data, completion) {
                    const from = CodeMirror.Pos(cursor.line, cursor.ch - token.string.length);                    
                    const codeBlock = '```bash\n\n```';
                    cm.replaceRange(codeBlock, from, cursor);

                    const newCursorPos = CodeMirror.Pos(cursor.line + 1, 0); 
                    cm.setCursor(newCursorPos);
                }
            },
            {
                text: '/hidden',
                displayText: '/hidden - bloque oculto',
                hint: function(cm, data, completion) {
                    const from = CodeMirror.Pos(cursor.line, cursor.ch - token.string.length);                    
                    const codeBlock = '<details>\n<summary>\n\n</summary>\n\n</details>';
                    cm.replaceRange(codeBlock, from, cursor);

                    const newCursorPos = CodeMirror.Pos(cursor.line + 2, 0); 
                    cm.setCursor(newCursorPos);
                }
            }
        ];

        try {
            const endpoint = `/api/hint?path=${window.location.pathname}`;
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Network response was not ok');
            const posibles_links = await response.json();

            posibles_links.forEach(endpoint => {
                    list.push({
                    text: `${endpoint}`,
                    displayText: `${endpoint}`,
                    hint: function(cm, data, completion) {
                        const from = CodeMirror.Pos(cursor.line, cursor.ch - token.string.length);
                        if (endpoint.endsWith('.png')||endpoint.endsWith('.jpg')) {
                            const codeBlock = `![${endpoint}](${endpoint})`;
                            cm.replaceRange(codeBlock, from, cursor);
                        } else {
                            const codeBlock = `[${endpoint}](${endpoint})`;
                            cm.replaceRange(codeBlock, from, cursor);
                        }
                    }
                })
            })
        } catch (err) {
            console.error('No se han podido cargar las hints', err);
        }

        const filteredList = list.filter(opt => opt.text.includes(currentText));

        return {
            list: filteredList,
            from: CodeMirror.Pos(cursor.line, cursor.ch - token.string.length),
            to: cursor
        };
    }
    return null;
}

// const htmlTableTemplate = `
// <table id="{{ tableID }}">{% for row in rows %}{% set rowloop = loop %}{% if loop.index == 1 %}<thead>{% endif %}{% if loop.index == 2 %}<tbody>{% endif %}
// <tr>
// {% for col in row %}{% if rowloop.index == 1 %}<th>{{ col }}</th>{% else %}<td>{{ col }}</td>{% endif %}{% endfor %}
// </tr>
// {% if loop.index == 1 %}</thead>{% endif %}{% endfor %}
// </tbody></table>
// `;

const htmlTableTemplate = `{% for row in rows %}{% set rowloop = loop %}{% for col in row %}| {{ col }} {% if loop.last %}|{% endif %}{% endfor %}
{% if rowloop.index==1 %}{% for col in row %}|-{% if loop.last %}|\n{% endif %}{% endfor %}{% endif %}{% endfor %}`;

function handlePaste(cm, event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    
    if (clipboardData.files.length > 0) {
        
        const file = clipboardData.files[0];
        if (file.type.startsWith('image/')) {
            event.preventDefault();
            
            const placeholder = cm.getCursor();
            cm.replaceSelection('![Subiendo imagen...]', 'end');
            
            subirImagen(file, cm, placeholder);
            return;
        }
    }

    const htmlData = clipboardData.getData('text/html');
    
    if (htmlData) {

        if (htmlData.includes('<table') || htmlData.includes('<TABLE')) {
            event.preventDefault(); // Prevenir el pegado de HTML por defecto
            
            // Llama a la nueva función para convertir HTML a Markdown
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            const htmltable = doc.getElementsByTagName('table')[0];
            const tableID = luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd-HH-mm-ss");
            let rows = [];
            for (const row of htmltable.getElementsByTagName('tr')) {
                let cols = [];
                for (const col of row.getElementsByTagName('td')) {
                    cols.push(col.innerHTML);
                }
                rows.push(cols);
            }
            let table = nunjucks.renderString(htmlTableTemplate, { rows, tableID });
            
            if (htmltable) {
                cm.replaceSelection(table);
                return; // Detener después de manejar la tabla
            }
        }
    }
}

function subirImagen(file, cm, placeholderPosition) {
    const formData = new FormData();
    formData.append('image', file);

    fetch(`/api/image?path=${window.location.pathname}`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.url) {
            const imageMarkdown = `![${file.name}](${data.url})`;
            
            const line = placeholderPosition.line;
            const chStart = cm.getLine(line).indexOf('![Subiendo imagen...]');
            const chEnd = chStart + '![Subiendo imagen...]'.length;
            
            if (chStart !== -1) {
                cm.replaceRange(imageMarkdown, {line: line, ch: chStart}, {line: line, ch: chEnd});
            } else {
                cm.replaceSelection(imageMarkdown);
            }
           
        } else {
            alert('Error al subir la imagen.');
            cm.replaceSelection(''); 
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error de red al subir la imagen.');
        cm.replaceSelection('');
    });
}

function guardarHistorial() {
    if (historial_index<historial_contenido.length-1) {
        historial_contenido = historial_contenido.slice(0, historial_index+1);
        historial_index = historial_contenido.length-1;
        document.getElementById('redo-button').style.pointerEvents = 'none';
    }

    historial_contenido.push(JSON.parse(JSON.stringify(contenido)));
    historial_index = historial_index + 1;
    if (historial_contenido.length > MAX_HISTORY_SIZE) {
        const removedItem = historial_contenido.shift();
        historial_index = historial_index - 1;
    }

    if (historial_contenido.length>1) {
        document.getElementById('undo-button').style.pointerEvents = 'all';
    } else {
        document.getElementById('undo-button').style.pointerEvents = 'none';
    }
}

function handleUndoAction() {
    if (editingBlockId) {
        return;
    }

    historial_index = historial_index-1;
    contenido = JSON.parse(JSON.stringify(historial_contenido[historial_index]));

    if (historial_index<=0) {
        document.getElementById('undo-button').style.pointerEvents = 'none';
    }
    document.getElementById('redo-button').style.pointerEvents = 'all';

    renderApp();
}

function handleRedoAction() {
    if (editingBlockId) {
        return;
    }

    historial_index = historial_index+1;
    contenido = JSON.parse(JSON.stringify(historial_contenido[historial_index]));

    if (historial_index===historial_contenido.length-1) {
        document.getElementById('redo-button').style.pointerEvents = 'none';
    }
    document.getElementById('undo-button').style.pointerEvents = 'all';

    renderApp();
}

async function addBlock(blockId) {
    if (currentEditor && editingBlockId) {
        return;
    }

    const newBlock = {
        'type': 'markdown',
        'created': luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss"),
        'modified': luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss"),
        'content': '',
    };

    contenido.splice(blockId, 0, newBlock);

    await renderApp();
    editBlock(blockId+1);
}

function editBlock(blockId) {
    if (editingBlockId) {
        return;
    }

    const editorChildren = document.getElementById('note-editor').children;

    const curBlockElement = editorChildren[blockId];
    const curBlock = contenido[blockId-1]
    previousHTMLcontent = curBlockElement.innerHTML;

    const editor = setupCodeMirror(curBlockElement, curBlock.content);
    editingBlockId = blockId;

    editor.focus();
    curBlockElement.scrollIntoView({ behavior: 'smooth' });
}

function moveBlock(blockId, direction) {
    if (editingBlockId) {
        return;
    }

    const newIndex = blockId + direction;
    if (newIndex < 0 || newIndex >= contenido.length) return;

    const block = contenido[blockId];
    contenido.splice(blockId, 1);
    contenido.splice(newIndex, 0, block);

    guardarHistorial();
    renderApp();
}

function deleteBlock(blockId) {
    if (editingBlockId) {
        return;
    }

    contenido.splice(blockId, 1);

    guardarHistorial();
    renderApp();
}

async function saveBlock() {
    let renderizar = false;
    if (!editingBlockId) return;
    // estamos editando un bloque que ya existe
    const editorChildren = document.getElementById('note-editor').children;

    const curBlockElement = editorChildren[editingBlockId];
    const bloqueEditado = contenido[editingBlockId-1];

    const nuevoContenido = currentEditor.getValue();
    if (nuevoContenido==='') {
        let historial = false;
        if (bloqueEditado.content!=='') historial = true;
        contenido.splice(editingBlockId-1, 1);

        currentEditor = null;
        editingBlockId = null;
        previousHTMLcontent = null;

        if (historial) guardarHistorial();
        await renderApp();
        return;
    }

    if (nuevoContenido !== bloqueEditado.content) {
        bloqueEditado.content = nuevoContenido;
        bloqueEditado.modified = luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss");
        renderizar = true;
        bloqueEditado.contentHTML = null;
    } else {
        curBlockElement.innerHTML = previousHTMLcontent;
    }

    currentEditor = null;
    editingBlockId = null;
    previousHTMLcontent = null;

    if (renderizar) {
        guardarHistorial();
        await renderApp();
    }
}

async function saveContent() {
    try {
        const endpoint = `/api/save?path=${window.location.pathname}`;
        const response = await fetch(endpoint, {
            method: "POST",
            body: JSON.stringify(contenido),
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error('Network response was not ok');

        return true;
    } catch (err) {
        console.error('No se ha podido guardar', err);
        return false;
    }
}

async function trashContent() {
    if (window.location.pathname==="/") return;

    const isConfirmed = confirm("Seguro que quieres eliminar?");
    deleteOp = true;

    if (!isConfirmed) {
        console.log("Operación cancelada por el usuario.");
        return false; 
    }

    try {
        await saveContent();
        const endpoint = `/api/trash?path=${window.location.pathname}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error('Network response was not ok');

        const curLocationParts = window.location.pathname.split('/');
        curLocationParts.pop();
        const newLocation = curLocationParts.join('/');
        if (newLocation==='') window.location.href = '/';
        else window.location.href = newLocation;

        return true;
    } catch (err) {
        console.error('No se ha podido guardar', err);
        return false;
    }
}

async function createNoteOrDir() {
    const createName = prompt("Insertar nombre del fichero (.md) o directorio:");

    if (!createName) {
        console.log("Operación cancelada por el usuario.");
        return false; 
    }

    try {
        await saveContent();
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

async function renderApp() {
    console.log('Renderizando contenido')
    
    const headers = []
    for (const [index, element] of contenido.entries()) {
        if (!element.contentHTML) {
            element.contentHTML = await marked.parse(element.content);            
        }

        const lines = element.content.split('\n');
        let insideCodeBlock = false;

        lines.forEach(line => {
            if (line.match(/^\s*```/)) {
                insideCodeBlock = !insideCodeBlock;
                return;
            }

            if (!insideCodeBlock) {
                const h1match = line.match(/^#\s+(.+)/);
                const h2match = line.match(/^##\s+(.+)/);
                if (h1match) {
                    headers.push({ level: 1, text: h1match[1], blockIndex: index });
                } else if (h2match) {
                    headers.push({ level: 2, text: h2match[1], blockIndex: index });
                }
            }
        });
    }

    let renderedHtml = nunjucks.renderString(plantilla_main_content, { items: contenido });
    mainContent.innerHTML = renderedHtml;

    const contenidoOrdenadoModified = contenido.map((item, index) => ({
        current_index: index,
        ...item
    })).sort((a, b) => {
        const dateA = luxon.DateTime.fromFormat(a.modified, 'yyyy-MM-dd HH:mm:ss');
        const dateB = luxon.DateTime.fromFormat(b.modified, 'yyyy-MM-dd HH:mm:ss');
        return dateB.toMillis() - dateA.toMillis();
    });

    const contenidoOrdenadoCreated = contenido.map((item, index) => ({
        current_index: index,
        ...item
    })).sort((a, b) => {
        const dateA = luxon.DateTime.fromFormat(a.created, 'yyyy-MM-dd HH:mm:ss');
        const dateB = luxon.DateTime.fromFormat(b.created, 'yyyy-MM-dd HH:mm:ss');
        return dateB.toMillis() - dateA.toMillis();
    });

    renderedHtml = nunjucks.renderString(plantilla_right_sidebar, {
        headers: headers,
        itemsModified: contenidoOrdenadoModified,
        itemsCreated: contenidoOrdenadoCreated
    });
    rightSidebar.innerHTML = renderedHtml;

    MathJax.typesetPromise([rightSidebar, mainContent]).catch((err) => console.error('MathJax typesetting error:', err));
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
    let segments = upbutton.split('/');
    segments.pop();
    segments.pop();

    if (segments.length>0) upbutton = '/' + segments.join('/');
    else upbutton = ''

    let renderedHtml = nunjucks.renderString(plantilla_left_sidebar, { dirtree, upbutton });
    leftSidebar.innerHTML = renderedHtml;

    document.querySelectorAll('.file-item').forEach(element => {
        if (element.getAttribute('data-path')===window.location.pathname) {
            element.classList.add('active');
        }
    });
}

// navigation
function scrollToBlock(e, blockId) {
    e.preventDefault();
    
    const container = document.getElementById('note-editor');
    const blockEl = container.children[blockId + 1];
    blockEl.scrollIntoView({ behavior: 'smooth' });
}

function gotoDirectory() {
    let upbutton = window.location.pathname;
    if (upbutton!=='/') {
        let segments = upbutton.split('/');
        segments.pop();
        if (segments.length>1) upbutton = segments.join('/');
        else upbutton = '/'
    } else {
        upbutton = '';
    }
    window.location.href = upbutton;
}

async function openFolder(folderDir) {
    if (historial_contenido.length>0) {
        saveBlock();
        let result = await saveContent();
        if (!result) {
            alert('Error al guardar el documento abierto.');
            return;
        }
    }
    window.location.href = folderDir;
}

async function loadNote() {
    try {
        const endpoint = `/api/load?path=${window.location.pathname}`;
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Network response was not ok');
        contenido = await response.json();

        document.getElementById('note-title').textContent = window.location.pathname.split('/').pop();
        
        guardarHistorial();
        renderApp();

    } catch (err) {
        console.error('No se han podido cargar el fichero', err);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // cargar plantillas
    try {
        let response = await fetch('/api/templates?path=main-content.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_main_content = await response.text();

        response = await fetch('/api/templates?path=right-sidebar.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_right_sidebar = await response.text();

        response = await fetch('/api/templates?path=left-sidebar.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_left_sidebar = await response.text();
    } catch (err) {
        console.error('No se han podido cargar las plantillas', err);
        document.getElementById('main-content').innerHTML = 'No se ha podido cargar la app';
        return;
    }
    
    renderLeftSidebar();
    loadNote();
});

window.addEventListener('beforeunload', async function(event) {
    if (deleteOp) {
        return;
    }
    console.log('Unloading');
    await saveBlock();
    await saveContent();
})