const env = nunjucks.configure({ autoescape: true });

const calendarGrid = document.getElementById('calendarGrid');
const monthYearHeader = document.getElementById('currentMonthYear');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const linkListContainer = document.getElementById('linkList');

let CALENDAR_TEMPLATE, LINK_LIST_TEMPLATE, selectedDate, currentDisplayDate, today, eventCounts, linkAggregates, dataList;

// --- Data Aggregation Function (as before) ---
function aggregateCounts(elements) {
    const counts = new Map();

    elements.forEach(element => {
        // Function to extract the date string (YYYY-MM-DD)
        const getDateString = (dateTimeStr) => dateTimeStr ? dateTimeStr.split(' ')[0] : null;

        const createdDate = getDateString(element.created);
        const modifiedDate = getDateString(element.modified);
        const todoCount = element.todos || 0; 
        
        // Ensure the count object exists for a given date
        const getOrCreateCount = (dateStr) => {
            if (!counts.has(dateStr)) {
                counts.set(dateStr, { created: 0, modified: 0, todos: 0 });
            }
            return counts.get(dateStr);
        };

        // --- 1. Handle Creation Event ---
        if (createdDate) {
            const currentCounts = getOrCreateCount(createdDate);
            // Increment the count of CREATED items for this date
            currentCounts.created += 1;
            
            // Sum the TODOs count on the CREATION DATE
            currentCounts.todos += todoCount;
        }

        // --- 2. Handle Modification Event ---
        if (modifiedDate) {
            // Only count a modification if it happened on a DIFFERENT day than creation
            if (modifiedDate !== createdDate) {
                const currentCounts = getOrCreateCount(modifiedDate);
                // Increment the count of MODIFIED items for this date
                currentCounts.modified += 1;
                
                // Do NOT add the todoCount here, as todos are tied to the element's existence/creation.
            }
        }
    });

    return counts;
}

function aggregateLinks(elements) {
    const linkMap = new Map();
    
    elements.forEach(element => {
        const link = element.link;
        const createdDate = element.created;
        const modifiedDate = element.modified;
        const todoCount = element.todos || 0;
        const dateStr = createdDate ? createdDate.split(' ')[0] : null;

        if (!linkMap.has(link)) {
            linkMap.set(link, {
                link: link,
                totalElements: 0,
                totalTodos: 0,
                createdDates: new Set(),
                modifiedDates: new Set(),
                lastModified: luxon.DateTime.fromSQL('1900-01-01 00:00:00'),
                events: []
            });
        }
        
        const linkData = linkMap.get(link);
        linkData.totalElements += 1;
        linkData.totalTodos += todoCount;
        linkData.events.push(element);

        // Track creation/modification events for link-specific counts
        linkData.createdDates.add(dateStr);
        if (modifiedDate) {
            linkData.modifiedDates.add(modifiedDate.split(' ')[0]);
        }

        // Track last modified date
        const currentModified = luxon.DateTime.fromSQL(modifiedDate || createdDate);
        if (currentModified > linkData.lastModified) {
            linkData.lastModified = currentModified;
        }
    });

    return linkMap;
}

// --- Calendar Rendering Function ---
function renderCalendar(date) {
    // 1. Update Header
    monthYearHeader.textContent = date.setLocale('es').toFormat('MMMM yyyy');

    // 2. Control Navigation
    // Disable 'Next' button if we are viewing the current month
    const isCurrentMonth = (date.month === luxon.DateTime.local().month) && (date.year === luxon.DateTime.local().year);
    nextMonthBtn.disabled = isCurrentMonth;

    // 3. Prepare Data for Nunjucks
    const calendarDays = [];
    const startOfMonth = date.startOf('month');
    // Start on the Sunday of the first week displayed (ISO weekday 7 is Sunday)
    const daysToSubtract = startOfMonth.weekday - 1;
    const calendarStart = startOfMonth.minus({ days: daysToSubtract });
    
    // Loop for 6 weeks (42 days) to ensure full display
    let day = calendarStart;
    for (let i = 0; i < 42; i++) {
        const dateString = day.toISODate();

        calendarDays.push({
            dayNumber: day.day,
            dateString: dateString,
            inactiveMonth: day.month !== date.month,
            isFuture: dateString > today,
            isToday: dateString === today,
            counts: eventCounts.get(dateString)
        });
        day = day.plus({ days: 1 });
    }

    // 4. Render Nunjucks Template
    const html = env.renderString(CALENDAR_TEMPLATE, { calendarDays: calendarDays });
    calendarGrid.innerHTML = html;
}

// --- Navigation Handlers ---
function changeMonth(delta) {
    currentDisplayDate = currentDisplayDate.plus({ months: delta });
    renderCalendar(currentDisplayDate);
}

prevMonthBtn.addEventListener('click', () => changeMonth(-1));
nextMonthBtn.addEventListener('click', () => {
    // Only allow changing month if it's not the current or future month
    const nextMonth = currentDisplayDate.plus({ months: 1 });
    const now = luxon.DateTime.local();
    if (nextMonth <= now.startOf('month')) {
        changeMonth(1);
    } else if (nextMonth.year === now.year && nextMonth.month === now.month) {
        changeMonth(1);
    }
});

function renderLinkList() {
    let linksToDisplay = Array.from(linkAggregates.values());

    if (selectedDate) {
        // --- 📅 MODE 1: DAY SELECTED (Data Preparation) ---
        
        const selectedDateEvents = dataList.filter(e => {
            const date = selectedDate;
            return (e.created && e.created.startsWith(date)) || (e.modified && e.modified.startsWith(date));
        });
        
        // Re-aggregate links based only on selected day's events
        const dailyLinkAggregates = aggregateLinks(selectedDateEvents);
        linksToDisplay = Array.from(dailyLinkAggregates.values());

        // Augment data with day-specific counts and sort
        linksToDisplay.forEach(linkData => {
            // Recalculate C and M specific to the selected day's events
            linkData.createdCount = linkData.events.filter(e => e.created && e.created.startsWith(selectedDate)).length;
            linkData.modifiedCount = linkData.events.filter(e => {
                const isModified = e.modified && e.modified.startsWith(selectedDate);
                const isCreatedSameDay = e.created && e.created.startsWith(selectedDate);
                // Only count as modification if it was modified on this day AND not created on this day (to align with calendar logic)
                return isModified && !isCreatedSameDay;
            }).length;
        });

        // Sort by totalTodos (highest first)
        linksToDisplay.sort((a, b) => b.totalTodos - a.totalTodos);

    } else {
        // --- 🌍 MODE 2: DEFAULT VIEW (Data Preparation) ---

        // Sort by last modified date (most recent first)
        linksToDisplay.sort((a, b) => b.lastModified.toMillis() - a.lastModified.toMillis());
        
        // Limit to top 10
        linksToDisplay = linksToDisplay.slice(0, 10);
    }
    
    // --- Render using Nunjucks ---
    const html = env.renderString(LINK_LIST_TEMPLATE, { 
        linksToDisplay: linksToDisplay,
        selectedDate: selectedDate 
    });
    
    linkListContainer.innerHTML = html;
}

function toggleDaySelection(dateString) {
    const calendarGrid = document.getElementById('calendarGrid');

    if (selectedDate === dateString) {
        // If the same day is clicked, deselect it (return to default view)
        selectedDate = null;
    } else {
        // Select the new day
        selectedDate = dateString;
    }
    
    // Remove 'selected-day' class from all days
    calendarGrid.querySelectorAll('.day-cell').forEach(cell => {
        cell.classList.remove('selected-day');
    });

    // Add 'selected-day' class to the newly selected day (if any)
    if (selectedDate) {
        const selectedCell = calendarGrid.querySelector(`[data-date="${selectedDate}"]`);
        if (selectedCell) {
            selectedCell.classList.add('selected-day');
        }
    }
    
    // Rerender the link list based on the new selection state
    renderLinkList();
}

document.addEventListener('DOMContentLoaded', async () => {
    let response = await fetch('/api/templates?path=calendar.html');
    if (!response.ok) throw new Error('Network response was not ok');
    CALENDAR_TEMPLATE = await response.text();

    response = await fetch('/api/templates?path=link-list.html');
    if (!response.ok) throw new Error('Network response was not ok');
    LINK_LIST_TEMPLATE = await response.text();

    currentDisplayDate = luxon.DateTime.local();
    today = luxon.DateTime.local().toISODate();
    selectedDate = null;

    response = await fetch(`/api/summary?path=${window.location.pathname}`);
    if (!response.ok) throw new Error('Network response was not ok');
    dataList = await response.json();
    eventCounts = aggregateCounts(dataList);
    console.log(dataList);

    linkAggregates = aggregateLinks(dataList);

    renderLinkList();

    // Initial render
    renderCalendar(currentDisplayDate);
});