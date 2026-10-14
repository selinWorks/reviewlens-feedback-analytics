# ReviewLens

### Customer Feedback Analytics

ReviewLens is a full-stack application being developed to help turn customer reviews into clear, actionable insights. It brings together a Python backend and a React interface, with a focus on review exploration, sentiment analysis, and visual reporting.

> **Status:** In active development. Features and implementation details may evolve as the project progresses.

---

## Overview

Customer reviews contain valuable information about satisfaction, expectations, and recurring problems. As feedback grows, manually reviewing individual comments makes it harder to understand the bigger picture.

ReviewLens aims to simplify this process by organizing feedback and presenting analytical results through an interactive dashboard.

## Project Goals

- **Explore customer feedback:** Organize review data in an accessible interface.
- **Analyze sentiment:** Examine positive, negative, and neutral feedback.
- **Identify recurring issues:** Highlight common concerns across reviews.
- **Visualize findings:** Present review patterns and summary metrics through charts and dashboard components.
- **Support informed decisions:** Make customer feedback easier to interpret and prioritize.

These goals describe the intended scope of the application. Development is ongoing.

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| API communication | HTTP, REST |
| Development tools | Git, npm, Python virtual environments |

## Architecture

The React frontend provides the user interface and communicates with the FastAPI backend through HTTP endpoints. The backend serves as the foundation for data processing and review analysis.

Keeping the interface and backend separate allows each part of the application to develop independently.

## Repository Structure

```text
reviewlens-feedback-analytics/
├── backend/       # FastAPI application and backend dependencies
├── frontend/      # React + TypeScript application
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11
- A Node.js version compatible with the frontend dependencies
- npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/selinWorks/reviewlens-feedback-analytics.git
cd reviewlens-feedback-analytics
```

### 2. Set Up the Backend

Open a terminal in the backend directory:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

**Windows — PowerShell**

```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
source .venv/bin/activate
```

Install the backend dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the development server:

```bash
python -m uvicorn main:app --reload
```

The backend runs at:

**http://127.0.0.1:8000**

FastAPI's interactive API documentation is available at:

**http://127.0.0.1:8000/docs**

### 3. Set Up the Frontend

Open a second terminal from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed in the terminal.

Keep both development servers running while using the application locally.

---

## Frontend Production Build

To generate a production build:

```bash
cd frontend
npm run build
```

The generated frontend files are written to the `frontend/dist` directory.

To preview the build locally:

```bash
npm run preview
```

This previews the frontend build; the backend must run separately for API-dependent functionality.

---

## Development Focus

ReviewLens is being built to connect practical full-stack development with customer feedback analysis.

The project focuses on:

- Building and integrating REST APIs with FastAPI.
- Developing a typed React interface with TypeScript.
- Preparing review data for analysis.
- Integrating sentiment analysis into an application workflow.
- Communicating analytical findings through a clear dashboard.

---

## Author

**Selin**

[GitHub](https://github.com/selinWorks)
