# FlowBoard Kanban Board

A modern, browser-based Kanban task manager built with vanilla JavaScript, Tailwind CSS (CDN), and custom CSS.

## Features

- Three-column board: **To Do**, **In Progress**, **Done**
- Create, edit, and delete tasks
- Drag and drop tasks across columns
- Priority and label filtering
- Full-text search (title, description, labels)
- Progress tracking per task
- Due date support and overdue indicators
- Board stats (total, in progress, done, completion %)
- Real-time sync across browser tabs (`BroadcastChannel` + `storage` fallback)
- Export tasks to Excel-compatible `.xls`
- Local persistence using `localStorage`
- Reset board to default sample tasks

## Tech Stack

- HTML5
- Vanilla JavaScript
- Tailwind CSS via CDN
- Custom CSS
- Font Awesome icons

## Run Locally

1. Open `index.html` directly in your browser.
2. Start managing tasks.

No build step or package installation is required.

## Project Structure

- `index.html` - App layout and UI markup
- `app.js` - State management, rendering, drag/drop, filters, modals, sync, export
- `styles.css` - Custom styling, animations, and responsive behavior

## Data Storage

Tasks are stored in browser `localStorage` using the key:

- `flowboard_tasks_v2`

Clearing browser site data will remove saved tasks.

## Keyboard Shortcuts

- `n` - Open **New Task** modal (when not typing in an input)
- `/` - Focus search box
- `Esc` - Close open modal

## Notes

- The Excel export generates an HTML-based `.xls` file for compatibility with spreadsheet apps.
- Real-time tab sync works best in modern browsers that support `BroadcastChannel`.
