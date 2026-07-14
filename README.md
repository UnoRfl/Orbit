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

<!-- 📸 SCREENSHOTS: make an "assets" folder in this repo and drop your images in with the names below.
     Until you add them, GitHub just shows the caption text — nothing breaks. -->

<p align="center">
  <img src="assets/hero.png" alt="Orbit — home screen showing who's free right now" width="850"/>
</p>

---

## ✨ What is Orbit?

Orbit turns your class schedule into a **live social map**. Add your friends, import your timetable once, and Orbit quietly keeps everyone's status up to date — *in class*, *free right now*, or *done for the day* — so you always know who's around to study, grab food, or just hang out.

No app store, no clutter. Sign up with an email and you're in, on your phone or your laptop.

It was designed and built solo — everything from the schedule parser to the last pixel of the interface.

---

## 🌌 What you can do

**Keep up with your circle**
- Friends live as glowing bubbles, styled a little like an Instagram story ring
- Real-time status the moment someone's class ends or begins
- Send quick **pings** and **pokes** to nudge a friend when you're both free

**Plan around real life**
- Invite friends to study sessions or hangouts in a couple of taps
- Orbit checks everyone's timetable and **warns you about schedule clashes** before you send the invite
- See who's in, who's out, and when

**A campus map, on your terms**
- Check in to campus spots shown as **planets orbiting a central star**
- Sharing is **opt-in only** — nothing is ever public by default
- Flip on **Ghost Mode** to go invisible whenever you want

**Make it yours**
- Six hand-tuned color themes, plus an **Auto** theme that slowly drifts through the whole spectrum
- Edit your profile, handle, and bubble colors
- Block anyone you'd rather not see — they vanish from your Orbit completely

---

## 🎨 The look & feel

Orbit leans into a **cyberpunk, deep-space** aesthetic — near-black purples, neon accents, and motion everywhere it counts:

- 🌠 **A living background** — a reactive seismic-wave field that ripples toward your cursor, with asteroids drifting past in the distance for depth
- 🚀 **A solar-system loader** — a top-down orrery that spins up from a standstill every time it loads, so each open feels like an engine igniting
- 🪐 **A space-themed map** — campus zones laid out as planets on their own orbits around a glowing "campus" star
- 📱 **Fully responsive** — a clean bottom-nav on mobile that becomes a side rail on desktop

Every piece of the interface is drawn in code and animated by hand — no template, no UI kit.

---

## 🛠 Built with

| | |
|---|---|
| **Frontend** | Preact + htm — a tiny, fast React-style setup with **no build step** |
| **Backend** | Supabase — accounts, database, and realtime updates |
| **Visuals** | Vanilla HTML Canvas for the background, loader, and map |
| **Hosting** | GitHub Pages |

The whole app ships as a **single `index.html`** — open it in a browser and it just runs.

---

## ⚙️ How it fits together

Orbit stays deliberately simple. There's no bundler and no framework scaffolding to wade through — one file holds the interface, the animations, and the data layer. Supabase handles sign-in and stores the schedules, friendships, plans, and check-ins, and pushes changes back out in real time so a friend's status flips the instant their class ends. Your theme and display settings save right on your device, so the app feels personal without a round trip to the server.

---

## 🚀 Run it yourself

1. Create a free project at [supabase.com](https://supabase.com/)
2. Run the included setup file (`orbit_database_setup_v2.sql`) in the Supabase SQL editor to create the tables
3. Paste your project **URL** and **anon key** into the top of `index.html`
4. Open the file in a browser — or push the repo to **GitHub Pages** to put it online

That's it. No install, no dependencies to download.

---

## 🔒 Privacy first

Location and status sharing are **off until you turn them on**, only your accepted friends can ever see you, Ghost Mode lets you disappear on demand, and blocking removes someone from your world entirely. Orbit is about staying in the loop with people you actually know — not broadcasting to strangers.

---

## 👤 About

Orbit is a solo project — designed, coded, and shipped end to end by **[UnoRfl](https://github.com/UnoRfl)**. It started as a way to solve a real everyday problem: figuring out which friends were actually free between classes. It grew into a full little product.

<div align="center">

**[🌐 Try Orbit live →](https://unorfl.github.io/Orbit/)**

<sub>Free to use. If you'd like to reuse the code, an MIT license is a good default — feel free to add a <code>LICENSE</code> file.</sub>

</div>
