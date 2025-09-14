# ProjLib


ProjLib is a modular, themed browser-like web interface for quickly launching and viewing curated sites in a sandboxed iframe — complete with dropdown menus, a modular theming engine, and playful animated themes.

---


## 🚀 Features

- **Customizable Home Page**  
  Loads a default home (configurable in `hubData.json`).

- **Category Dropdowns**  
  Six categories (Brain Tease, Arcade, Animation, Readable, Watchable, Dailies) populated from `hubData.json`.

- **Modular Theming Engine**  
  8 distinct animated visual themes:
  `main` (futuristic darkweb console), `kuromi`, `comic`, `matrix`, `glitch`, `anime`, `cyberpunk`, `minimal`.

- **Proxy Mode**  
  Toggle to load all sites through a proxy (`https://proxy.liyao.space/------`).

- **Animated Theme Effects**  
  Each theme can have its own JS/CSS for overlays, particles, scanlines, glitch, and more.

- **Interactive Controls**  
  Home, Refresh, Theme Toggle, Fullscreen, and URL search form.

- **Notifications & Loading Overlay**  
  User alerts and loading spinner while iframe content loads.

- **Responsive Design**  
  Mobile‑friendly layout and controls.

---


## 📂 Project Structure

```
projlib/
├── index.html            # Main app shell
├── css/
│   ├── style.css         # Base styles
│   └── themes/
│       ├── main.css      # Main (darkweb) theme
│       ├── kuromi.css    # Kuromi theme
│       ├── comic.css     # Comic theme
│       ├── matrix.css    # Matrix theme
│       ├── glitch.css    # Glitch theme
│       ├── anime.css     # Anime theme
│       ├── cyberpunk.css # Cyberpunk theme
│       └── minimal.css   # Minimal theme
├── js/
│   ├── apps.js           # Main app logic and theme loader
│   └── themes/
│       ├── main.js       # Main theme effects
│       ├── kuromi.js     # Kuromi theme effects
│       ├── comic.js      # Comic theme effects
│       ├── matrix.js     # Matrix theme effects
│       ├── glitch.js     # Glitch theme effects
│       ├── anime.js      # Anime theme effects
│       ├── cyberpunk.js  # Cyberpunk theme effects
│       └── minimal.js    # Minimal theme effects
├── hubData.json          # Configurable categories & links
├── assets/               # Theme images/icons (kuromi.png, pow.png, splash.png, zap.png)
└── LICENSE
```

---


## ⚙️ Configuration

- **Default Home Page**  
  Set in `hubData.json` → `defaultHome`.

- **Categories & Links**  
  Managed in `hubData.json` → `categories` array.

---

npx serve .

## 🛠 How to Run

1. Clone the repository:
  ```bash
  git clone https://github.com/<your-username>/<your-repo>.git
  cd <your-repo>
  ```
2. Serve with any static web server (to allow local JSON fetches). For example:
  ```bash
  npx serve .
  ```
  or use VS Code Live Server, http-server, etc.
3. Open http://localhost:PORT in your browser.

Here’s a future‑proof, practical README.md draft for your GitHub repo that documents exactly what exists today, leaves room for minor changes, and avoids locking you into brittle specifics.
You can copy‑paste this into a README.md file in your repo root.

# ProjLib Beta

ProjLib Beta is a themed, browser‑like web interface that lets you quickly launch and view curated sites in a sandboxed iframe — complete with dropdown menus, tab masking, a live news ticker, and playful animated themes.

---

## 🚀 Features

- **Customizable Home Page**  
  Loads a default home (`archive.org` by default — configurable in `hubData.json`).

- **Category Dropdowns**  
  Six categories (Brain Tease, Arcade, Animation, Readable, Watchable, Dailies) populated from `hubData.json`.

- **Tab Masking**  
  Change the tab’s title and favicon on the fly from a predefined list.

- **Theming Engine**  
  8 distinct animated visual themes:
  `dark`, `geek`, `minimal`, `kuromi`, `tech`, `comic`, `anime`, `cyberpunk`.

- **RSS News Ticker**  
  Scrolls the latest headlines (currently from RTP Mundo RSS feed).

- **Interactive Controls**  
  Home, Refresh, Theme Toggle, Fullscreen, and URL search form.

- **Notifications & Loading Overlay**  
  User alerts and loading spinner while iframe content loads.

- **Responsive Design**  
  Mobile‑friendly layout and controls.

---

## 📂 Project Structure


/ (root) ├── index.html          # Main app shell ├── css/ │   └── styles.css      # All themes & responsive styles ├── js/ │   └── app.js          # Core logic and boot sequence ├── hubData.json        # Configurable categories & links └── assets/             # Theme images/icons

---

## ⚙️ Configuration

- **Default Home Page**  
  Set in `hubData.json` → `defaultHome`.

- **Categories & Links**  
  Managed in `hubData.json` → `categories` array.

- **Blacklisted Domains**  
  Listed in `hubData.json` → `blacklistedDomains`.

---

## 🛠 How to Run

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>


2. Serve with any static web server (to allow local JSON fetches). For example:
npx serve .
2. or open in a local dev server (VS Code Live Server, http‑server, etc.).
3. Open http://localhost:PORT in your browser.


---

## 🧩 Modularity & Customization

- **Adding Links:**
  Just edit `hubData.json` — no JS changes needed.
- **Adding a Theme:**
  Add it to the `themes` array in `apps.js` and create the corresponding CSS/JS files.
- **Theme Effects:**
  Each theme can have its own JS for overlays, particles, scanlines, etc.


## 📜 License

All Rights Reserved. See LICENSE for details.


## 🙌 Credits
- Fonts: Orbitron
- Icons: Remix Icon
