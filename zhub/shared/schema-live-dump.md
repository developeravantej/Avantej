# Live DB FK Dump

Generated: 2026-05-05T14:23:10.505Z
DB: control-panel (combined w/ tenant in dev)
Tables: 12
FKs: 14

## Tables

- account
- admin_sessions
- ghl_branch_links
- organization_analytics
- organization_branches
- organization_members
- organizations
- platform_admins
- session
- subscriptions
- user
- verification

## Foreign Keys

| Child | Col | → | Parent | Col | onDelete |
|---|---|---|---|---|---|
| account | user_id | → | user | id | CASCADE |
| admin_sessions | admin_user_id | → | user | id | CASCADE |
| admin_sessions | impersonated_user_id | → | user | id | CASCADE |
| admin_sessions | organization_id | → | organizations | id | SET NULL |
| ghl_branch_links | organization_id | → | organizations | id | CASCADE |
| organization_analytics | organization_id | → | organizations | id | CASCADE |
| organization_branches | organization_id | → | organizations | id | CASCADE |
| organization_members | organization_id | → | organizations | id | CASCADE |
| organization_members | user_id | → | user | id | CASCADE |
| organizations | owner_user_id | → | user | id | NO ACTION |
| organizations | subscription_id | → | subscriptions | id | RESTRICT |
| platform_admins | granted_by | → | user | id | SET NULL |
| platform_admins | user_id | → | user | id | CASCADE |
| session | user_id | → | user | id | CASCADE |
