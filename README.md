<div align="center">

# 🪐 Orbit

### A little social universe for students.

**See who's free, who's stuck in class, and plan study sessions — without the group-chat chaos.**

<br/>

[![Preact](https://img.shields.io/badge/Preact-673AB8?style=for-the-badge&logo=preact&logoColor=white)](https://preactjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)

</div>


## ✨ What is Orbit?

Orbit turns a class schedule into a **live social map**. By importing your timetable once and adding your friends, Orbit quietly keeps everyone's status up to date—*in class*, *free right now*, or *done for the day*—so you always know who's around to study, grab food, or just hang out.

No app store, no clutter. Sign up with an email and you're in, on a phone or laptop.

I designed and built Orbit entirely solo, handling everything from the schedule parser to the final pixel of the interface.

---

## 🌌 Core Features

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

## 🎨 The Look & Feel

I designed Orbit with a **cyberpunk, deep-space** aesthetic featuring near-black purples, neon accents, and intentional, fluid motion:

* 🌠 **A living background:** A reactive seismic-wave field that ripples toward your cursor, with asteroids drifting in the distance to create depth.
* 🚀 **A solar-system loader:** A top-down orrery that spins up from a standstill every time the app loads, making every session feel like an engine igniting.
* 🪐 **A space-themed map:** Campus zones are laid out as planets on their own orbits around a glowing "campus" star.
* 📱 **Fully responsive:** A clean bottom-nav on mobile that seamlessly transitions into a side rail on desktop.

I drew and animated every piece of the interface by hand in code—no UI kits or templates were used.

---

## 🛠 Built With

| Component | Technology |
|---|---|
| **Frontend** | Preact + htm — a tiny, fast React-style setup with **no build step**. |
| **Backend** | Supabase — handles authentication, the database layer, and real-time socket connections. |
| **Visuals** | Vanilla HTML Canvas — powers the background, loader, and map rendering. |

---

## ⚙️ Architecture Overview

I kept Orbit's architecture deliberately simple and lightweight. There is no heavy bundler and no complex framework scaffolding to wade through; a unified codebase handles the interface, the animations, and the data layer. 

The backend handles secure authentication and stores encrypted schedules, friendships, plans, and check-ins. It utilizes real-time subscriptions to push changes instantly, so a friend's status flips the exact second their class ends. User preferences and display settings are cached directly to the local device, ensuring the app feels native, fast, and personal without requiring unnecessary round trips to the server.

---

## 🔒 Privacy First

I prioritized privacy from day one. Location and status sharing are **off until you actively turn them on**. Only your accepted friends can see your activity, Ghost Mode lets you disappear on demand, and blocking removes someone from your feed entirely. Orbit is built for staying in the loop with people you actually know, not broadcasting to strangers.

---

## 👤 About

Orbit is a solo project—designed, coded, and shipped end-to-end. I started it as a way to solve a real, everyday problem: figuring out which friends were actually free between classes. What began as a simple schedule-matching utility grew into a fully realized social tool.

<div align="center">

<sub>Released under the MIT License. Feel free to review the code and learn from the architecture.</sub>

</div>
