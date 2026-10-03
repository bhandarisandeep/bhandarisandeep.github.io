---
layout: post
title: "Hello, World: Why I'm Starting This Blog"
date: 2026-07-08 10:00:00 +0530
tags: [meta, diary, learning, appsec]
image: /assets/img/card-hello-world.svg
excerpt: "This blog is a digital diary: a record of what I learn, what breaks, and how I fix it, from big security work to a small home network project, shared in case it helps someone else."
---

Welcome. This blog started as a notebook I was going to keep for myself, and then I
thought: why not let other people read it too?

I've spent the last several years working in application and product security: threat
modeling, code review, mobile security, and looking for scalable, high-impact issues.
But the thing I've learned most is that the most useful knowledge isn't the polished
version. It's the messy part: what I tried first, what didn't work, and what finally
did.

## Why I'm Writing This

I keep forgetting things.

I'll spend a whole afternoon figuring out why a setting doesn't apply, or why a
network share says "no permission" when the password is correct. I fix it, feel
good for about ten minutes, and then three months later I hit the same problem and
have no idea how I solved it.

So this blog is a **digital diary**. It has three jobs:

- **Remember.** Writing it down is how I make sure the lesson sticks.
- **Keep the evidence.** Failures are as important as successes. A record of a wrong
  turn is often more useful than the right answer, because the next person probably
  will take the same wrong turn.
- **Share it.** If something I learned saves someone a few hours, the diary has done
  more than I expected.

Nothing here is too small to write about. A security finding, a new tool, a home
network that refuses to share a folder: they all count. If I learned something while
building it, it belongs here.

## Where It Starts

The first real entry is a small project, not a security write-up. I wanted a shared
folder on my Windows PC that every device in the house could reach, without buying a
NAS. The post covers the setup and, more honestly, the three or four problems I hit
along the way:

- [How to Set Up a Small Home File Share to Transfer Files Within Your Network](/posts/2026/10/03/how-to-set-up-a-small-home-file-share/)

It's a good example of what this blog is for. The setup itself took minutes. The
debugging took much longer, and that's the part I most want to remember.

## What to Expect

The themes I'll be writing about:

- **Threat modeling in practice.** Not the textbook version, but what actually works
  when you're sitting with an engineering team.
- **Mobile and web security.** Real vulnerability patterns, and how to fix them
  centrally instead of one ticket at a time.
- **AppSec at scale.** Using automation and AI-driven tooling to keep security up with
  engineering speed.
- **Home and personal tech projects.** Networking, homelab work, and other small
  experiments, including the ones that fail.

Every post follows the same approach: what I was trying to do, what went wrong, what I
checked, and what I learned.

## How This Is Built

This site is a hand-built static page, and the blog runs on **Jekyll**, which GitHub
Pages builds automatically. Writing a new post is just adding a Markdown file like this
one. No build server, no database.

> A diary is only useful if it's honest about the failures.

More soon.
