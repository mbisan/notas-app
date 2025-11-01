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
let plantilla_main_content_info = null;
let plantilla_left_sidebar = null;
let plantilla_right_sidebar = null;
let historial_contenido = [];
let historial_index = -1;
const MAX_HISTORY_SIZE = 50;
let contenido = null;

// document permanent elements
const mainContent = document.getElementById('main-content');
const leftSidebar = document.getElementById('left-sidebar');
const rightSidebar = document.getElementById('right-sidebar');

const toggleLeftButton = document.getElementById('toggle-left-sidebar');
const toggleRightButton = document.getElementById('toggle-right-sidebar');

let currentEditor = null;
let editingBlockId = null;
let previousHTMLcontent = null;

function setupCodeMirror(containerElement, content) {
    if (currentEditor) {
        currentEditor=null;
    }

    containerElement.innerHTML = '';

    const editor = CodeMirror(containerElement, {
        value: content,
        mode: 'markdown',
        theme: '3024-night',
        lineNumbers: true,
        lineWrapping: true,
        extraKeys: {
            'Ctrl-Enter': saveContent,
            'Shift-Enter': saveContent
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
            const endpoint = "/load-hint";
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

    fetch('/upload-image' + window.location.pathname, {
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

function handleNewBlock(containerId) {
    if (containerId===editingBlockId) return;

    if (currentEditor) {
        const bloqueActual = contenido.find(element => `block-${element.index}` === editingBlockId);
        if (bloqueActual) {
            // hay cambios sin guardar, no cambio de sitio el editor
            if (currentEditor.getValue() !== bloqueActual.content) return;
        } else if (currentEditor.getValue() !== '') return;
    }

    let newBlockContent = ''
    if (containerId.startsWith('block-')) {
        const bloqueEditado = contenido.find(element => `block-${element.index}` === containerId);
        newBlockContent = bloqueEditado.content;
    }

    // Find the newly created block placeholder
    const blockElement = document.getElementById(containerId);
    if (blockElement) {

        if (editingBlockId) {
            document.getElementById(editingBlockId).innerHTML = previousHTMLcontent;
            document.getElementById(editingBlockId).classList.toggle('codemirror-editing'); 
        };

        previousHTMLcontent = blockElement.innerHTML;
        editingBlockId = containerId;
        blockElement.innerHTML = '';
        blockElement.classList.toggle('codemirror-editing');
        
        const editor = setupCodeMirror(blockElement, newBlockContent);

        editor.focus();
        scrollToBlock(containerId);
    }
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
    historial_index = historial_index-1;
    contenido = JSON.parse(JSON.stringify(historial_contenido[historial_index]));

    if (historial_index<=0) {
        document.getElementById('undo-button').style.pointerEvents = 'none';
    }
    document.getElementById('redo-button').style.pointerEvents = 'all';

    renderApp();
}

function handleRedoAction() {
    historial_index = historial_index+1;
    contenido = JSON.parse(JSON.stringify(historial_contenido[historial_index]));

    if (historial_index===historial_contenido.length-1) {
        document.getElementById('redo-button').style.pointerEvents = 'none';
    }
    document.getElementById('undo-button').style.pointerEvents = 'all';

    renderApp();
}

function deleteBlock(blockId) {
    if (currentEditor && editingBlockId) {
        return;
    }

    const deleteId = parseInt(blockId.replace('block-', ''), 10);
    contenido.splice(deleteId-1, 1);

    contenido.forEach((element, i) => {
        element.index = i + 1;
    })

    guardarHistorial();
    renderApp();
}

function saveContent() {
    let renderizar = false;
    if (!editingBlockId && !currentEditor) return;
    if (editingBlockId.startsWith('block-')) {
        // estamos editando un bloque que ya existe
        const bloqueEditado = contenido.find(element => `block-${element.index}` === editingBlockId);
        const nuevoContenido = currentEditor.getValue();
        if (nuevoContenido !== bloqueEditado.content) {
            bloqueEditado.content = nuevoContenido;
            bloqueEditado.modified = luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss");
            renderizar = true;
            bloqueEditado.contentHTML = null;
        } else {
            document.getElementById(editingBlockId).innerHTML = previousHTMLcontent;
            document.getElementById(editingBlockId).classList.toggle('codemirror-editing'); 
        }

    } else if (editingBlockId.startsWith('editor-')) {
        const nuevoContenido = currentEditor.getValue();
        if (nuevoContenido !== '') {
            renderizar = true;

            // recupero el indice del bloque que estoy editando
            const newId = parseInt(editingBlockId.replace("editor-", ""), 10) + 1;
            contenido.forEach(element => {
                if (element.index>=newId) {
                    element.index = element.index + 1;
                }
            })

            // creo el bloque nuevo
            const newBlock = {
                'index': newId,
                'type': 'markdown',
                'created': luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss"),
                'modified': luxon.DateTime.now().setZone("Europe/Madrid").toFormat("yyyy-MM-dd HH:mm:ss"),
                'content': nuevoContenido,
            }
            
            // inserto en la posición index
            contenido.splice(newId-1, 0, newBlock);
        } else {
            document.getElementById(editingBlockId).innerHTML = previousHTMLcontent;
            document.getElementById(editingBlockId).classList.toggle('codemirror-editing'); 
        }
    }

    currentEditor = null;
    editingBlockId = null;
    previousHTMLcontent = null;

    document.getElementById('save-button').style.opacity = 1;
    document.getElementById('save-button').style.pointerEvents = 'all';

    if (renderizar) {
        guardarHistorial()
        renderApp();
    }
}

async function saveToServer() {
    try {
        const endpoint = "/save" + window.location.pathname;
        const response = await fetch(endpoint, {
            method: "POST",
            body: JSON.stringify(contenido),
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error('Network response was not ok');

        document.getElementById('save-button').style.opacity = 0;
        document.getElementById('save-button').style.pointerEvents = 'none';

        return true;
    } catch (err) {
        console.error('No se ha podido guardar', err);
        return false;
    }
}

let draggedBlockId = null; // Global variable to store the ID of the block being dragged

function enableDrag() {
    if (currentEditor && editingBlockId) {
        return false;
    }
    return true;
}

function handleDragStart(event) {
    if (!enableDrag()) return;
    
    draggedBlockId = event.currentTarget.id.replace('drag-', '');
    document.getElementById(`block-${draggedBlockId}`).classList.add('block-dragging');
    event.dataTransfer.setData('text/plain', draggedBlockId);
}

function handleDragEnd(event) {
    if (!enableDrag()) return;


    event.preventDefault();
    document.getElementById(`block-${draggedBlockId}`).classList.remove('block-dragging');
}

function handleDragOver(event) {
    if (!enableDrag()) return;


    event.preventDefault();
}

function handleDrop(event) {
    if (!enableDrag()) return;

    event.preventDefault();
    
    const draggedId = parseInt(event.dataTransfer.getData('text/plain'), 10);
    const targetId = parseInt(event.currentTarget.id.replace('editor-', ''), 10);

    if ((draggedId-1)===targetId) return;

    const draggedBlockData = contenido.splice(draggedId-1, 1)[0];

    if (targetId<(draggedId-1)) {
        contenido.splice(targetId, 0, draggedBlockData);
    } else {
        contenido.splice(targetId-1, 0, draggedBlockData);
    }

    contenido.forEach((element, i) => {
        element.index = i + 1;
    })

    guardarHistorial();
    renderApp();
}


// searchbar

const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

let allBlocks = [];
let isLoadingBlocks = false;

// Fetch all blocks once when the page loads
async function loadAllBlocks() {
    if (isLoadingBlocks || allBlocks.length > 0) return;
    isLoadingBlocks = true;

    try {
        const response = await fetch("/load-everything");
        if (!response.ok) throw new Error("Failed to load blocks");
        allBlocks = await response.json();
    } catch (err) {
        console.error("Error loading blocks:", err);
    } finally {
        isLoadingBlocks = false;
    }
}

// Handle search input
searchInput.addEventListener("input", async (e) => {
    loadAllBlocks();

    const query = e.target.value.trim().toLowerCase();
    if (query === "") {
        searchResults.style.display = "none";
        return;
    }

    const matches = allBlocks.filter(block =>
        block.content.toLowerCase().includes(query) ||
        block.link.toLowerCase().includes(query)
    );

    renderSearchResults(matches, query);
});

function renderSearchResults(matches, query) {
    if (matches.length === 0) {
        searchResults.innerHTML = `<p>No results found for "${query}".</p>`;
        searchResults.style.display = "block";
        return;
    }

    const resultsHTML = matches.map(block => `
        <div class="search-result-item" data-link="${block.link}">
            <h4>${highlightQuery(block.link, query)}</h4>
            <div class="search-snippet">${highlightQuery(block.content.slice(0, 200), query)}...</div>
            <small>Modified: ${block.modified}</small>
        </div>
    `).join("");

    searchResults.innerHTML = resultsHTML;
    searchResults.style.display = "block";

    document.querySelectorAll(".search-result-item").forEach(item => {
        item.addEventListener("click", () => {
            const link = item.getAttribute("data-link");
            window.location.href = link;
        });
    });
}

function highlightQuery(text, query) {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    return text.replace(regex, `<mark style="background: #61afef; color: black;">$1</mark>`);
}

document.addEventListener("click", (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.style.display = "none";
    }
});


async function renderApp() {
    console.log('Renderizando contenido')
    
    const headers = []
    for (const element of contenido) {
        if (!element.contentHTML) {
            element.contentHTML = await marked.parse(element.content);            
        }

        const lines = element.content.split('\n');
        lines.forEach(line => {
            const h1match = line.match(/^#\s+(.+)/);
            const h2match = line.match(/^##\s+(.+)/);
            if (h1match) {
                headers.push({ level: 1, text: h1match[1], blockIndex: element.index });
            } else if (h2match) {
                headers.push({ level: 2, text: h2match[1], blockIndex: element.index });
            }
        });
    }

    let renderedHtml = nunjucks.renderString(plantilla_main_content, { items: contenido });
    mainContent.innerHTML = renderedHtml;

    renderedHtml = nunjucks.renderString(plantilla_right_sidebar, { headers: headers });
    rightSidebar.innerHTML = renderedHtml;

    MathJax.typesetPromise([rightSidebar, mainContent]).catch((err) => console.error('MathJax typesetting error:', err));
}

function renderLeftSidebar(dirtree) {
    let renderedHtml = nunjucks.renderString(plantilla_left_sidebar, { dirtree });
    leftSidebar.innerHTML = renderedHtml;
}

// navigation
function scrollToBlock(blockId) {
    const block_id = parseInt(blockId.replace('block-', ''), 10)-1;
    const separator = document.getElementById(`editor-${block_id}`);
    if (separator) separator.scrollIntoView({ behavior: 'smooth'});
}

function toggleLeftSidebar() {
    leftSidebar.classList.toggle('left-sidebar-hidden');
    layout.classList.toggle('left-hidden'); 
}

function toggleRightSidebar() {
    rightSidebar.classList.toggle('right-sidebar-hidden');
    layout.classList.toggle('right-hidden'); 
}

document.addEventListener('DOMContentLoaded', async function() {
    searchInput.value = '';

    // cargar plantillas
    try {
        let response = await fetch('/nunjucks-templates/main-content.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_main_content = await response.text();

        response = await fetch('/nunjucks-templates/main-content-info.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_main_content_info = await response.text();

        response = await fetch('/nunjucks-templates/right-sidebar.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_right_sidebar = await response.text();

        response = await fetch('/nunjucks-templates/left-sidebar.html');
        if (!response.ok) throw new Error('Network response was not ok');
        plantilla_left_sidebar = await response.text();
    } catch (err) {
        console.error('No se han podido cargar las plantillas', err);
        document.getElementById('main-content').innerHTML = 'No se ha podido cargar la app';
        return;
    }

    // cargar fichero solicitado
    if (window.location.pathname.endsWith('.md')) {
        try {
            const endpoint = "/load" + window.location.pathname;
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Network response was not ok');
            contenido = await response.json();
        } catch (err) {
            console.error('No se han podido cargar el fichero', err);
            document.getElementById('main-content').innerHTML = 'No se ha podido cargar el fichero';
            // return;
        }
    } else {
        try {
            const endpoint = "/load-everything";
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Network response was not ok');
            contenido = await response.json();
            contenido = contenido.slice(0, 50);
            plantilla_main_content = plantilla_main_content_info;
            plantilla_right_sidebar = '';
        } catch (err) {
            console.error('No se han podido cargar el fichero', err);
            document.getElementById('main-content').innerHTML = 'No se ha podido cargar el fichero';
        }
    }
    
    try {
        const endpoint = "/load-dirtree" + window.location.pathname;
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Network response was not ok');
        const dirtree = await response.json();
        renderLeftSidebar(dirtree);
    } catch (err) {
        console.error('No se han podido cargar la barra lateral', err);
        document.getElementById('main-content').innerHTML = 'No se ha podido cargar la barra lateral';
        return;
    }

    if (contenido) {
        guardarHistorial();

        renderApp();
    }
});

async function beforeNavigation() {
    saveContent();
    return saveToServer();
}

document.addEventListener("click", async (event) => {
    if (!window.location.href.endsWith('.md')) return;

    const link = event.target.closest("a");
    if (!link || !link.getAttribute("href")) return;

    const href = link.getAttribute("href");

    if (href.startsWith("#") || href.startsWith("javascript:")) return;

    event.preventDefault();
    const proceed = await beforeNavigation(href);
    console.log(proceed);

    if (proceed) {
        window.location.href = href;
    } else {
        console.log("Navigation cancelled by beforeNavigation()");
    }
});
