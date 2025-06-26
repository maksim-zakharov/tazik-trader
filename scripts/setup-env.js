const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

const envContent = `
DATABASE_URL=${process.env.DATABASE_URL}
SHADOW_DATABASE_URL=${process.env.SHADOW_DATABASE_URL}
PM2_PUBLIC_KEY=${process.env.PM2_PUBLIC_KEY}
PM2_SECRET_KEY=${process.env.PM2_SECRET_KEY}
NODE_ENV=production
`;

fs.writeFileSync(envPath, envContent.trim());
console.log('.env file created successfully!');
