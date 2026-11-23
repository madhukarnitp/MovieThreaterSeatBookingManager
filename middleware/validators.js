const { body, validationResult } = require('express-validator');

/**
 * Customer registration validation rules
 */
const registrationValidationRules = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters.')
    .matches(/^[a-zA-Z\s.'-]+$/).withMessage('Full name contains invalid characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('phone')
    .trim()
    .optional({ checkFalsy: true })
    .matches(/^[+]?[\d\s\-()]{7,20}$/).withMessage('Please enter a valid phone number.'),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),

  body('confirm_password')
    .notEmpty().withMessage('Please confirm your password.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    })
];

/**
 * Customer and Admin login validation rules
 */
const loginValidationRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
];

/**
 * Validation result middleware helper
 */
function handleValidationErrors(viewName, pageTitle, activePage) {
  return (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg);
      return res.status(422).render(viewName, {
        title: pageTitle,
        activePage: activePage || '',
        errors: errorMessages,
        oldInput: req.body,
        alert: {
          type: 'danger',
          message: errorMessages[0]
        }
      });
    }
    next();
  };
}

module.exports = {
  registrationValidationRules,
  loginValidationRules,
  handleValidationErrors
};
