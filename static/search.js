
const searchInput = document.getElementById("search-input");
searchInput.value = '';
const searchResults = document.getElementById("search-results");

// Handle search input
searchInput.addEventListener("input", async (e) => {

    const query = e.target.value.trim().toLowerCase();
    if (query === "") {
        searchResults.style.display = "none";
        return;
    }

    try {
        const response = await fetch(`/api/search?path=${window.location.pathname}`, {
            method: "POST",
            body: JSON.stringify({'query': query}),
            headers: {"Content-type": "application/json; charset=UTF-8"}
        });
        if (!response.ok) throw new Error("Failed to load blocks");
        const searchresponse = await response.json();
        console.log(searchresponse);
        renderSearchResults(searchresponse, query);
    } catch (err) {
        console.error("Error loading blocks:", err);
    }
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
        item.addEventListener("dblclick", () => {
            window.location.href = item.getAttribute('data-link');
        });
    });
}

function highlightQuery(text, query) {
    console.log(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    return text.replace(regex, `<mark style="background: #61afef; color: black;">$1</mark>`);
}
