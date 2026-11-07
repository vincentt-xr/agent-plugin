---
name: get-started
description: Start working on a Vincentt camera experience through the Vincentt app. Use when someone asks to make, change, preview or publish a face filter, try-on, AR scene or other camera experience on Vincentt.
---

# Get started with Vincentt

Vincentt hosts camera experiences that run in a phone's browser: face filters, try-ons, AR scenes and
interactive campaigns. Each one is a Vincentt project whose files Vincentt stores, builds and serves.

1. Call `vincentt_guide` with the topic `connector` to read how projects, saves, previews and
   publishing work. It is Vincentt's product documentation, matched to the project's version.
2. Call `list_projects` to see the person's workspaces and projects. Use `create_project` for a new
   one; it starts as a working camera experience at version 1.
3. Read files with `read_project`, then save changes with `save_files`. Every save is a new
   numbered version with a check.
4. When a step is done, send the person to the project in the Vincentt editor: the save and create
   results include its link. The editor shows the running experience and is where they change
   images and text, comment and publish.
5. When they want to try it on their phone, use `get_preview` for a private link and a QR code.
6. `publish` puts a version live at the project's address. A first publish returns an approval link
   for the person to open; nothing goes live until they approve it in the Vincentt console.

Vincentt cannot delete projects or files, or change members, plans or billing through this app.
Point the person to the Vincentt console for those.
