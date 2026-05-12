# Live Tenant DB FK Dump

Org: Test Fitness Franchise (996febce-aaad-4ded-8f47-02d2b566c8ee)
Generated: 2026-05-05T14:24:48.477Z
Tables: 77
FKs: 104

## Tables

- announcements
- appointment_clients
- appointment_staff
- appointments
- audit_logs
- brands
- category_commission_configs
- check_ins
- class_slots
- coach_intake_availability
- coach_intake_exceptions
- commission_coach_slots
- commission_condition_rates
- commission_conditions
- commission_splits
- commission_tier_rates
- customer_profiles
- dashboard_snapshots
- drizzle_migrations
- expenses
- ghl_contact_links
- ghl_sync_events
- ghl_user_links
- google_calendar_connections
- google_calendar_event_mappings
- hierarchy_nodes
- installment_events
- installment_plans
- installments
- invitations
- invoices
- member_category_buffer_overrides
- member_profiles
- member_service_buffer_overrides
- member_sessions
- members
- notification_preferences
- notifications
- organization_settings
- package_instance_staff
- package_instances
- partner_stripe_accounts
- payment_items
- payments
- payouts
- permissions
- preferred_times
- product_categories
- product_stock
- products
- promotion_usages
- promotions
- purchase_order_items
- purchase_orders
- recurrence_rules
- refunds
- role_permissions
- roles
- rooms
- sales_order_items
- sales_orders
- service_categories
- service_category_config
- service_members
- services
- stock_request_items
- stock_requests
- suppliers
- tax_rates
- trainer_availability
- trainer_tiers
- transfer_order_items
- transfer_orders
- units_of_measure
- user_activity_log
- waitlist_entries
- walk_in_customers

## Foreign Keys

| Child | Col | → | Parent | Col | onDelete |
|---|---|---|---|---|---|
| announcements | branch_id | → | hierarchy_nodes | id | CASCADE |
| appointment_clients | appointment_id | → | appointments | id | CASCADE |
| appointment_clients | package_instance_id | → | package_instances | id | SET NULL |
| appointment_clients | walk_in_customer_id | → | walk_in_customers | id | NO ACTION |
| appointment_staff | appointment_id | → | appointments | id | CASCADE |
| appointments | branch_id | → | hierarchy_nodes | id | RESTRICT |
| appointments | class_slot_id | → | class_slots | id | SET NULL |
| appointments | package_instance_id | → | package_instances | id | SET NULL |
| appointments | recurring_parent_id | → | appointments | id | CASCADE |
| appointments | room_id | → | rooms | id | SET NULL |
| appointments | sales_order_id | → | sales_orders | id | SET NULL |
| appointments | service_id | → | services | id | SET NULL |
| appointments | trainer_id | → | members | id | SET NULL |
| category_commission_configs | category_id | → | service_categories | id | CASCADE |
| check_ins | appointment_client_id | → | appointment_clients | id | SET NULL |
| check_ins | branch_id | → | hierarchy_nodes | id | RESTRICT |
| class_slots | branch_id | → | hierarchy_nodes | id | RESTRICT |
| class_slots | instructor_id | → | members | id | SET NULL |
| class_slots | service_id | → | services | id | CASCADE |
| coach_intake_availability | trainer_id | → | members | id | CASCADE |
| coach_intake_exceptions | trainer_id | → | members | id | CASCADE |
| commission_coach_slots | config_id | → | category_commission_configs | id | CASCADE |
| commission_condition_rates | condition_id | → | commission_conditions | id | CASCADE |
| commission_condition_rates | trainer_tier_id | → | trainer_tiers | id | RESTRICT |
| commission_conditions | config_id | → | category_commission_configs | id | CASCADE |
| commission_splits | appointment_id | → | appointments | id | CASCADE |
| commission_splits | payout_id | → | payouts | id | SET NULL |
| commission_splits | sales_order_id | → | sales_orders | id | RESTRICT |
| commission_tier_rates | config_id | → | category_commission_configs | id | CASCADE |
| commission_tier_rates | trainer_tier_id | → | trainer_tiers | id | RESTRICT |
| expenses | branch_id | → | hierarchy_nodes | id | RESTRICT |
| ghl_contact_links | customer_profile_id | → | customer_profiles | id | SET NULL |
| google_calendar_connections | member_id | → | members | id | CASCADE |
| google_calendar_event_mappings | appointment_id | → | appointments | id | CASCADE |
| google_calendar_event_mappings | connection_id | → | google_calendar_connections | id | CASCADE |
| hierarchy_nodes | parent_id | → | hierarchy_nodes | id | RESTRICT |
| installment_events | installment_id | → | installments | id | SET NULL |
| installment_events | package_instance_id | → | package_instances | id | CASCADE |
| installments | package_instance_id | → | package_instances | id | CASCADE |
| invitations | hierarchy_scope_id | → | hierarchy_nodes | id | RESTRICT |
| invoices | sales_order_id | → | sales_orders | id | SET NULL |
| member_category_buffer_overrides | category_id | → | service_categories | id | CASCADE |
| member_category_buffer_overrides | member_id | → | members | id | CASCADE |
| member_profiles | member_id | → | members | id | CASCADE |
| member_service_buffer_overrides | member_id | → | members | id | CASCADE |
| member_service_buffer_overrides | service_id | → | services | id | CASCADE |
| member_sessions | admin_member_id | → | members | id | CASCADE |
| member_sessions | impersonated_member_id | → | members | id | CASCADE |
| members | hierarchy_scope_id | → | hierarchy_nodes | id | RESTRICT |
| members | trainer_tier_id | → | trainer_tiers | id | SET NULL |
| package_instance_staff | package_instance_id | → | package_instances | id | CASCADE |
| package_instances | payment_id | → | payments | id | SET NULL |
| package_instances | service_id | → | services | id | RESTRICT |
| package_instances | walk_in_customer_id | → | walk_in_customers | id | NO ACTION |
| payment_items | payment_id | → | payments | id | CASCADE |
| payouts | appointment_id | → | appointments | id | RESTRICT |
| payouts | commission_split_id | → | commission_splits | id | SET NULL |
| preferred_times | package_instance_id | → | package_instances | id | CASCADE |
| product_stock | branch_id | → | hierarchy_nodes | id | RESTRICT |
| product_stock | product_id | → | products | id | CASCADE |
| products | brand_id | → | brands | id | SET NULL |
| products | category_id | → | product_categories | id | SET NULL |
| products | supplier_id | → | suppliers | id | SET NULL |
| products | uom_id | → | units_of_measure | id | RESTRICT |
| promotion_usages | promotion_id | → | promotions | id | CASCADE |
| promotions | branch_id | → | hierarchy_nodes | id | SET NULL |
| purchase_order_items | product_id | → | products | id | RESTRICT |
| purchase_order_items | purchase_order_id | → | purchase_orders | id | CASCADE |
| purchase_orders | branch_id | → | hierarchy_nodes | id | RESTRICT |
| purchase_orders | supplier_id | → | suppliers | id | RESTRICT |
| recurrence_rules | appointment_id | → | appointments | id | CASCADE |
| refunds | branch_id | → | hierarchy_nodes | id | RESTRICT |
| refunds | package_instance_id | → | package_instances | id | RESTRICT |
| refunds | payment_id | → | payments | id | RESTRICT |
| refunds | sales_order_id | → | sales_orders | id | RESTRICT |
| role_permissions | permission_id | → | permissions | id | CASCADE |
| role_permissions | role_id | → | roles | id | CASCADE |
| rooms | branch_id | → | hierarchy_nodes | id | RESTRICT |
| sales_order_items | appointment_id | → | appointments | id | SET NULL |
| sales_order_items | product_id | → | products | id | SET NULL |
| sales_order_items | sales_order_id | → | sales_orders | id | CASCADE |
| sales_order_items | service_id | → | services | id | SET NULL |
| sales_orders | branch_id | → | hierarchy_nodes | id | RESTRICT |
| service_categories | branch_id | → | hierarchy_nodes | id | RESTRICT |
| service_category_config | category_id | → | service_categories | id | CASCADE |
| service_members | member_id | → | members | id | CASCADE |
| service_members | service_id | → | services | id | CASCADE |
| services | branch_id | → | hierarchy_nodes | id | RESTRICT |
| services | category_id | → | service_categories | id | RESTRICT |
| stock_request_items | product_id | → | products | id | RESTRICT |
| stock_request_items | stock_request_id | → | stock_requests | id | CASCADE |
| stock_requests | from_branch_id | → | hierarchy_nodes | id | RESTRICT |
| stock_requests | issued_by_member_id | → | members | id | RESTRICT |
| stock_requests | to_branch_id | → | hierarchy_nodes | id | RESTRICT |
| trainer_availability | trainer_id | → | members | id | CASCADE |
| transfer_order_items | product_id | → | products | id | RESTRICT |
| transfer_order_items | transfer_order_id | → | transfer_orders | id | CASCADE |
| transfer_orders | from_branch_id | → | hierarchy_nodes | id | RESTRICT |
| transfer_orders | issued_by_member_id | → | members | id | RESTRICT |
| transfer_orders | to_branch_id | → | hierarchy_nodes | id | RESTRICT |
| units_of_measure | base_uom_id | → | units_of_measure | id | RESTRICT |
| waitlist_entries | appointment_id | → | appointments | id | SET NULL |
| waitlist_entries | class_slot_id | → | class_slots | id | CASCADE |
| walk_in_customers | branch_id | → | hierarchy_nodes | id | SET NULL |
