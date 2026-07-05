// Script to generate bcrypt hash for PIN
const bcrypt = require('bcrypt');

const pin = process.argv[2] || '123456';

bcrypt.hash(pin, 10)
  .then(hash => {
    console.log(`PIN: ${pin}`);
    console.log(`Hash: ${hash}`);
    console.log('\nUse this hash in the database:');
    console.log(hash);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
