-- Rollback for 0011_seed_builtin_roles.sql, run by `flare migrate:rollback`.
DELETE FROM `role` WHERE `name` IN ('admin', 'staff');
