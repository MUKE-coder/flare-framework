-- Built-in roles: lib/admin.ts lets both into /admin. Apps created later seed them in 0000_init.sql.
INSERT OR IGNORE INTO `role` (`name`, `label`) VALUES ('admin', 'Admin'), ('staff', 'Staff');
