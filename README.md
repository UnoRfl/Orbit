<div align="center">

# 🪐 Orbit

### A little social universe for students.

**See who's free, who's stuck in class, and plan study sessions — without the group-chat chaos.**

<br/>

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_Orbit-b06bff?style=for-the-badge)](https://unorfl.github.io/Orbit/)
&nbsp;
[![Preact](https://img.shields.io/badge/Preact-673AB8?style=for-the-badge&logo=preact&logoColor=white)](https://preactjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=for-the-badge&logo=githubpages&logoColor=white)](https://pages.github.com/)

</div>

<p align="center">
  <img src="assets/hero.png" alt="Orbit — home screen showing who's free right now" width="850"/>
</p>

---

## ✨ What is Orbit?

Orbit turns your class schedule into a **live social map**. Add your friends, import your timetable once, and Orbit quietly keeps everyone's status up to date—*in class*, *free right now*, or *done for the day*—so you always know who's around to study, grab food, or just hang out.

No app store, no clutter. Sign up with an email and you're in, on your phone or your laptop.

I designed and built Orbit entirely solo, handling everything from the schedule parser to the final pixel of the interface.

---

## 🌌 What you can do

**Keep up with your circle**
* Friends live as glowing bubbles, styled like an active story ring.
* Real-time status updates trigger the exact moment a friend's class begins or ends.
* Send quick **pings** and **pokes** to nudge a friend when you're both free.

**Plan around real life**
* Invite friends to study sessions or hangouts in just a couple of taps.
* Orbit automatically cross-references everyone's timetable and **warns you about schedule clashes** before you send an invite.
* See who's in, who's out, and exactly when they are available.

**A campus map, on your terms**
* Check in to campus spots, represented as **planets orbiting a central star**.
* Sharing is **opt-in only**—absolutely nothing is public by default.
* Toggle **Ghost Mode** to go invisible whenever you need to focus.

**Make it yours**
* Six hand-tuned color themes, plus an **Auto** theme that slowly drifts through the full spectrum.
* Fully customizable profile, handle, and bubble colors.
* Block anyone you'd rather not see—they vanish from your Orbit completely.

---

## 🎨 The look & feel

I designed Orbit with a **cyberpunk, deep-space** aesthetic featuring near-black purples, neon accents, and intentional, fluid motion:

* 🌠 **A living background:** A reactive seismic-wave field that ripples toward your cursor, with asteroids drifting in the distance to create depth.
* 🚀 **A solar-system loader:** A top-down orrery that spins up from a standstill every time the app loads, making every session feel like an engine igniting.
* 🪐 **A space-themed map:** Campus zones are laid out as planets on their own orbits around a glowing "campus" star.
* 📱 **Fully responsive:** A clean bottom-nav on mobile that seamlessly transitions into a side rail on desktop.

I drew and animated every piece of the interface by hand in code—no templates, no UI kits.

---

## 🛠 Built with

| Component | Technology |
|---|---|
| **Frontend** | Preact + htm — a tiny, fast React-style setup with **no build step**. |
| **Backend** | Supabase — handles accounts, the database, and realtime updates. |
| **Visuals** | Vanilla HTML Canvas — powers the background, loader, and map. |
| **Hosting** | GitHub Pages |

I engineered the entire app to ship as a **single `index.html`** file. Open it in a browser, and it just runs.

---

## ⚙️ How it fits together

I kept Orbit's architecture deliberately simple. There's no bundler and no framework scaffolding to wade through; one file holds the interface, the animations, and the data layer. Supabase handles authentication and stores the schedules, friendships, plans, and check-ins. It pushes changes back out in real time, so a friend's status flips the instant their class ends. User preferences and display settings save directly to the device, ensuring the app feels fast and personal without requiring an unnecessary round trip to the server.

---

## 🚀 Run it yourself

1. Create a free project at [supabase.com](https://supabase.com/).
2. Run the included setup file (`orbit_database_setup_v2.sql`) in the Supabase SQL editor to create the necessary tables.
3. Paste your project **URL** and **anon key** into the top of `index.html`.
4. Open the file in a browser—or push the repository to **GitHub Pages** to host it live.

That's it. No installation required, and no dependencies to download.

---

## 🔒 Privacy first

I prioritized privacy from day one. Location and status sharing are **off until you actively turn them on**. Only your accepted friends can see your activity, Ghost Mode lets you disappear on demand, and blocking removes someone from your feed entirely. Orbit is built for staying in the loop with people you actually know, not broadcasting to strangers.

---

## 👤 About

Orbit is my solo project—designed, coded, and shipped end-to-end. I started it as a way to solve a real, everyday problem: figuring out which friends were actually free between classes. What began as a simple utility grew into a fully realized product.

<div align="center">

**[🌐 Try Orbit live →](https://unorfl.github.io/Orbit/)**

<sub>Free to use. If you'd like to reuse the code, an MIT license is a good default — feel free to add a <code>LICENSE</code> file.</sub>

</div>
