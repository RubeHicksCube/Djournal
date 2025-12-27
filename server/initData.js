const bcrypt = require('bcrypt');
const { getUserByUsername, createUser } = require('./dataAccess');

function initializeDefaultAdmin() {
  try {
    // Check if admin user already exists
    const existingAdmin = getUserByUsername('admin');

    if (!existingAdmin) {
      const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
      const adminId = createUser('admin', null, adminPasswordHash, true);
      console.log('✅ Default admin user created (ID:', adminId, ')');
      console.log('   Username: admin');
      console.log('   Password:', process.env.ADMIN_PASSWORD || 'admin123');
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error initializing admin user:', error);
  }
}

module.exports = { initializeDefaultAdmin };
