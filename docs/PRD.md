# MasterControl — Product Requirements Document

**Status**: Draft
**Last Updated**: 2026-04-25

## Overview
Personal CRM for an account executive. Centralizes organizations (customers,
agents, OEMs), their contacts, projects, apps they run, and AI-assisted notes.
Runs locally at `C:\mastercontrol\`, accessed via browser.

## Core User Stories (Phase 1)

### Navigation
- Left sidebar with three sections: Customers, Agents, OEM
- Each section lists organizations of that type
- A Settings link at the bottom of the sidebar

### Organization Detail Page
Two tabs:
- **Info**: name + type-specific metadata, contacts list, apps list, projects list
  (each with inline add/remove forms)
- **Notes**: chronological notes with an AI chat composer at the bottom

### Notes & AI Interface
- Write a note; optionally prompt Claude with full org context preloaded
  (org name/type/metadata, contacts, recent projects, recent notes)
- Claude response streams in real-time
- Note + AI response are persisted

### Settings
- Page to enter and save the Anthropic API key
- Backend reads key from `settings` table for each Claude call

## Out of Scope (Phase 1)
- Multi-user / authentication
- Email/Outlook integration
- Mobile
- File attachments on notes
- Cross-org search

## Open Questions
- Status values for projects (active/paused/closed/won/lost)?
- Should notes also be exportable to markdown?
