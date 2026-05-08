DELETE FROM activities 
WHERE type = 'USDZ_CONVERT' 
AND "createdAt" >= CURRENT_DATE 
AND "userEmail" = 'amrutha34@gmail.com';
