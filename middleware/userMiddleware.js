module.exports = (req, res, next) => {
  // Check if a user is authenticated and exists in the session
  if (req.session && req.session.user) {
    res.locals.user = req.session.user; // Make user available to all EJS templates
  } else {
    res.locals.user = null; // Set user to null if not authenticated
  }
  next(); // Continue to the next middleware or route
};
