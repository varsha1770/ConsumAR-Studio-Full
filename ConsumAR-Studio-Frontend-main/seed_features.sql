DELETE FROM "FeatureConfig";
INSERT INTO "FeatureConfig" ("tier", "dailyUploadLimit", "dailyRescaleLimit", "monthlyRescaleLimit", "dailyUsdzLimit", "monthlyUsdzLimit", "historyDownloadLimit", "allowedUnits", "isUsdzUnlimited")
VALUES 
('NON_LOGGED', 10, 2, 999999, 1, 999999, 0, ARRAY['centimeters'], false),
('FREE', 10, 3, 60, 2, 15, 2, ARRAY['centimeters', 'feet'], false),
('PAID', 100, 20, 250, 999999, 999999, 10, ARRAY['centimeters', 'feet', 'meters', 'millimeters', 'inches'], true);
