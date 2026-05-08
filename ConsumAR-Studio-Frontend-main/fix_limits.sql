UPDATE "FeatureConfig" SET "allowedUnits" = ARRAY['centimeters', 'feet'] WHERE tier = 'FREE';
UPDATE "FeatureConfig" SET "allowedUnits" = ARRAY['centimeters', 'feet', 'meters', 'millimeters', 'inches'] WHERE tier = 'PAID';
UPDATE "FeatureConfig" SET "dailyUploadLimit" = 10, "dailyRescaleLimit" = 3, "monthlyRescaleLimit" = 60, "dailyUsdzLimit" = 2, "monthlyUsdzLimit" = 15 WHERE tier = 'FREE';
