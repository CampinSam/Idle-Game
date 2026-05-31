# Derp Universe Admin Panel Architecture

## Overview

The admin backend should be treated as four products in one:

1. Content CMS
2. Approval Pipeline
3. Live Ops Console
4. Support & Trust Console

This architecture supports versioned content, seasonal operations, player support, moderation, and operational monitoring.

---

# Dashboard

The Dashboard acts as mission control.

### Recommended Widgets

- Active players
- New users
- Retention metrics
- Active missions
- Active crafting jobs
- Open support tickets
- Pending approvals
- Current season status
- Economy alerts
- Recent admin actions

---

# Content Management

This is where designers and content editors work.

## Sections

- Missions
- Mission Requirements
- Rewards / Loot Tables
- Items & Consumables
- Relics
- Crafting Recipes
- Materials
- Outposts
- Buildings
- Rooms
- Bird Archetypes
- Traits
- Synergies
- Dialogue & Flavor Text
- Shop Cosmetics
- Battle Pass Rewards

## Content States

Every content object should support:

- Draft
- In Review
- Approved
- Scheduled
- Live
- Archived

Editors should never directly modify live content.

---

# Live Ops

Separate live operations from static content editing.

## Sections

- Seasons
- Weekly Events
- Daily Quests
- Seasonal Missions
- Boss Configuration
- Battle Pass Configuration
- Announcements
- Scheduled Reward Grants
- Limited-Time Shop Rotations
- Global Modifiers

---

# Player Support

Support staff should be able to inspect nearly everything while modifying only approved areas.

## Features

- Player Lookup
- Account Profile
- Wallet / NFT Ownership
- Inventory
- Resources
- Birds
- Outposts
- Missions
- Crafting Jobs
- Purchase History
- Support Tickets
- Ban / Restriction Tools
- Manual Grants
- Recovery Tools
- Bug Reports
- Internal Notes

## Permission Examples

### Support Agent

- View users
- View inventory
- View mission history
- Add notes
- Escalate tickets

### Senior Support

- Resolve stuck missions
- Retry failed jobs
- Grant limited compensation
- Apply temporary restrictions

### Admin

- Ban users
- Modify account state
- Revoke rewards
- Manage permissions

---

# Economy & Balance

Restricted to senior designers and administrators.

## Features

- Resource faucet dashboards
- Resource sink dashboards
- Arcanium generation vs spending
- Essence generation vs spending
- Material inflation reports
- Mission success analysis
- Crafting output analysis
- Reward simulation tools
- Free-player vs whale comparison tools

---

# Moderation & Trust

## Features

- User reports
- Abuse reports
- Fraud investigations
- Multi-account detection
- NFT ownership anomalies
- Chargeback tracking
- Ban appeals
- Moderator action history

---

# Technical Operations

Engineering-focused administration tools.

## Features

- Job queues
- Failed mission processing
- Failed crafting jobs
- NFT scanner status
- Cache status
- Worker status
- Error logs
- Deployment version
- Feature flags
- Maintenance mode
- Incident response tools

---

# Permissions Model

Start with RBAC (Role-Based Access Control).

## Roles

| Role | Purpose |
|--------|---------|
| Owner | Full access |
| Admin | Manage users and content |
| Game Designer | Edit content drafts |
| Approver | Review and approve content |
| Live Ops Manager | Manage events and seasons |
| Support Agent | Handle tickets |
| Senior Support | Limited account repair |
| Moderator | Reports and bans |
| Engineer | Technical operations |
| Read Only | View-only access |

### Critical Rule

The person creating content should not be the only person approving content.

---

# Recommended Database Tables

```sql
admin_users
admin_roles
admin_permissions

content_versions
content_approvals

admin_audit_logs

support_tickets
support_ticket_messages
support_actions

manual_grants
player_notes

moderation_actions

feature_flags
system_announcements
```

---

# Audit Logging

Every meaningful administrative action should record:

- Who performed the action
- What changed
- Previous value
- New value
- Reason
- Timestamp
- Affected object
- Approval reference

No silent edits should ever occur.

---

# Recommended Sidebar Layout

```text
Dashboard

Content
  Missions
  Rewards
  Items
  Crafting
  Relics
  Outposts
  Characters / Traits
  Dialogue
  Cosmetics

Approvals
  Pending Review
  Approved
  Scheduled
  Release History

Live Ops
  Seasons
  Events
  Battle Pass
  Bosses
  Announcements
  Shop Rotations

Players
  User Search
  Player Profiles
  Wallet Lookup
  Grants
  Restrictions

Support
  Tickets
  Bug Reports
  Compensation Queue
  Escalations

Economy
  Resource Dashboard
  Reward Simulators
  Inflation Reports
  Balance Changes

Moderation
  Reports
  Bans
  Suspicious Activity

System
  Feature Flags
  Jobs / Queues
  Logs
  Admin Users
  Roles & Permissions
  Audit Log
```

---

# Recommended Workflow

Use versioned definitions rather than direct database edits.

## Example

```text
Mission Template v3 (Live)

Designer creates v4 Draft
        ↓
Approver reviews changes
        ↓
Approver approves v4
        ↓
Live Ops schedules release
        ↓
System publishes automatically
        ↓
v3 remains available for rollback
```

This workflow greatly reduces the risk of economy-breaking mistakes and supports safe seasonal releases.
