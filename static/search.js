searchbar

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
