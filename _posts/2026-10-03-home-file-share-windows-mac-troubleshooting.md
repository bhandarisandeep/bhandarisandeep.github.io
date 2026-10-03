---
layout: post
title: "Setting Up a Home File Share on Windows and Fixing 'You Do Not Have Permission' on a Mac"
date: 2026-10-03 10:00:00 +0530
tags: [windows, smb, networking, troubleshooting, homelab]
image: /assets/img/card-file-share.svg
excerpt: "A step-by-step record of setting up a password-protected Windows file share for the home network, and of tracking down a 'no permission' error that turned out to be a saved login on the Mac, not the share itself."
---

I wanted a folder on my Windows PC that I could reach from any device in the house
without emailing files around. The setup itself took about ten minutes. Getting the
Mac to connect took much longer, and the error it showed ("You do not have
permission") pointed in exactly the wrong direction.

This post covers the whole process: what I set up, each problem I hit, how I checked
it, and what the fix was. Each section follows the same order: **symptom, check, and
result**. If you're following along, you can use the same checks.

## What We Set Up

![A request passes through the Wi-Fi router to the PC, then three permission gates](/assets/img/fs-setup.svg)

The goal was a shared folder with a simple password. I didn't want to share my main
Windows login, so the plan was:

1. Create a folder: `C:\Share`
2. Create a separate local account, `homeshare`, that has no admin rights
3. Give that account **Full** access to the share and **Modify** access to the folder
4. Turn on the Windows File and Printer Sharing firewall rules
5. Connect from other devices with `homeshare` and its password

The request has to pass through all three gates on the PC: the firewall, the share
permission, and the NTFS folder permission. If any one of them blocks it, the client
gets a permission error, even when the password is correct.

## Problem 1: The Setup Script Failed on a Parameter Name

My first run of the PowerShell setup script stopped with:

```
A parameter cannot be found that matches parameter name 'UserMayChangePassword'.
```

**Check:** `New-LocalUser` does not have a `-UserMayChangePassword` parameter. Its
only related option is `-UserMayNotChangePassword`, and the default already allows
password changes.

**Fix:** remove the parameter and run the script again.

**Lesson:** when a cmdlet reports a parameter that doesn't exist, run
`Get-Help <cmdlet> -Parameter *` before you try variations.

## Problem 2: The Wrong IP Address

The script reported `192.168.56.1` as the PC's IP. That address looked wrong for a
home network, because it's in a range normally used by virtual adapters.

**Check:** I listed every active adapter with its IP and gateway:

```powershell
Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' }
```

The output showed a VirtualBox "Host-Only" adapter alongside the real Wi-Fi adapter,
which had the router as its gateway. The Wi-Fi address was the one to use.

**Lesson:** on a machine with virtual adapters, don't take the first IP address you
see. Check which adapter has the default gateway, because that's the one on your
real network.

## Problem 3: "No Permission" From Another Windows PC

The share showed up in the network list, but opening it gave a permission error.

**Check, part 1: the server side.** I checked every gate:

```powershell
Get-SmbShareAccess -Name Share           # share permission
icacls C:\Share                          # NTFS permission
Get-LocalUser -Name homeshare            # account enabled?
Get-NetConnectionProfile                 # Private or Public network?
Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\Lsa -Name ForceGuest
```

All of them were correct. `homeshare` had Full share access and Modify NTFS access.
The network was Private, the guest account was disabled, and `ForceGuest` was `0`,
which means local accounts log in with their own credentials.

**Result:** the server was fine. That pointed to the connecting client.

**Fix:** Windows was quietly trying the client's own login name first. From the
other PC, I cleared the old connection and connected with the account explicitly:

```
net use \\192.168.x.x\Share /delete
net use \\192.168.x.x\Share /user:homeshare <password>
```

**Lesson:** when a share is visible but access is denied, the server is often fine.
Windows clients can try the wrong account and then fail without asking for a new
password. Connecting explicitly removes the guesswork.

## Problem 4: The Mac Still Said "No Permission"

The Mac showed the same error, even after I typed `homeshare` in the connection
dialog. I needed to find out what the PC was actually receiving.

**Check:** the Windows Security log records every failed login as Event ID **4625**.
Reading it requires admin rights, so I ran a small elevated PowerShell query that
pulled out the username, status, and client address for each failure:

```powershell
Get-WinEvent -LogName Security -MaxEvents 3000 |
  Where-Object { $_.Id -eq 4625 -and $_.TimeCreated -gt (Get-Date).AddHours(-2) }
```

![Login decision flow with the failure code for each step](/assets/img/fs-login-flow.svg)

The events showed two things:

- **The username was wrong.** The Mac was sending `fileshare`, not `homeshare`.
  That account doesn't exist, so the status was `0xC000006D` with substatus
  `0xC0000064`, which means "user name does not exist."
- **Guest attempts were failing too.** Some attempts were for `Guest`, which failed
  with `0xC0000072` (account disabled). This is expected, because guest access is off.

Each failed attempt was logged with the Mac's name and IP address. Those are useful
for troubleshooting, but I left them out of this post.

**Lesson:** a generic "no permission" message on the client can hide a basic problem
like a wrong username. The server's Security log tells you what it actually received.
The codes are the fastest way to tell "wrong name" from "wrong password" from "account
disabled."

| Substatus | Meaning | What to fix |
|---|---|---|
| `0xC0000064` | Username does not exist | Correct the username on the client |
| `0xC000006A` | Wrong password | Reset the account password |
| `0xC0000072` | Account disabled | Enable the account |
| `0xC0000234` | Account locked out | Unlock after too many attempts |

## Problem 5: Deleting the Saved Login Didn't Help

On the Mac, the wrong name was still being used after I connected using a
`smb://homeshare@...` address. I searched Keychain Access for the server's address
and deleted matching entries. Nothing changed.

**Check:** I used Terminal to look at the Keychain directly:

```bash
security find-internet-password -s <server-ip>
```

The stored item didn't have the `fileshare` account. So the name was coming from
somewhere other than Keychain, and I hadn't found where.

**Lesson:** when you delete a saved credential and nothing changes, the app may be
keeping that state somewhere else. Test the connection directly so you can see
whether the share works, separate from whatever the app remembers.

## The Fix: Test the Share Directly From Terminal

I stopped troubleshooting the Mac's saved state and mounted the share from Terminal
with the account passed in directly:

```bash
mkdir -p ~/ShareMount
mount_smbfs //homeshare:<password>@192.168.x.x/Share ~/ShareMount
ls ~/ShareMount
umount ~/ShareMount
```

Note that `@` in the password has to be written as `%40` in that address. A
password that contains `@` needs this encoding too, or the address will parse wrong.

It worked. That confirmed the share, the account, and the password were all fine.
The problem was the saved connection on the Mac, and mounting directly got around it.

I didn't fully identify where the old name was stored, so I'm not going to guess at
it here.

## What I'd Do Differently

- **Check the server first.** The share permissions, NTFS permissions, and firewall
  rules were all correct from the beginning. I could have confirmed that before
  testing from the Mac.
- **Read the Security log early.** It would have shown the wrong username on the first
  attempt, which saved a lot of time.
- **Test directly before debugging the client app.** Mounting from Terminal separates
  "is the share broken?" from "is the app remembering something wrong?"
- **Keep secrets out of commands and posts.** The password is in this post as a
  placeholder only. Shell commands with passwords end up in shell history, so for
  anything beyond a quick test, let the client prompt for it.

## Quick Checklist

1. Share visible but denied? Check the share, NTFS, account, firewall, and network profile.
2. Still denied? Read the Security log for Event 4625 and match the substatus code.
3. Name is wrong? Fix the client, not the server.
4. Saved login keeps coming back? Test with a direct mount, then clear the saved state.
5. Share works directly but not in the app? The problem is the app's saved state.

Home file sharing is simple to set up. Most of the time goes to working out which
side of the connection is wrong, and the logs usually answer that.
