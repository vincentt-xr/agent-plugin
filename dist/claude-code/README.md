# Vincentt

Vincentt is a platform for building AR apps that run in a phone's browser. The work happens in a project folder on this machine, and the project's own agent contract describes how that work is done.

## What this plugin runs and sends

This plugin contains no code and runs nothing on its own. It is text that helps Claude recognise when a person wants to build an AR app with Vincentt, and it points Claude to the Vincentt command-line tool, which is installed separately from npm. The plugin itself sends no data anywhere.

The command-line tool is what talks to Vincentt. It signs in to a Vincentt account through the browser and keeps an access token on this machine. It uploads a built app when the person asks to publish it, and it opens a preview session through Vincentt's servers so the app can load on a phone. A problem report leaves the machine only when the person sends one, or after the person has turned on automatic reporting for their account.

## Install

Requires the Vincentt CLI: `npm install -g @vincentt-xr/cli`

```
claude plugin marketplace add https://github.com/vincentt-xr/agent-plugin.git
claude plugin install vincentt@vincentt-xr
```

Start a new conversation after installing.

Docs: https://github.com/vincentt-xr/agent-plugin

MIT licensed.
