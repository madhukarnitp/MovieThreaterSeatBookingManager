const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

router.get('/admin/login', (req, res) => res.redirect('/login'));
router.post('/admin/login', authController.postLogin);

router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

router.get('/logout', authController.logout);
router.post('/logout', authController.logout);
router.post('/admin/logout', authController.logout);

module.exports = router;
