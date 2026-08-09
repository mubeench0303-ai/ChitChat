package repository

import "errors"

var ErrNotFound = errors.New("repository: not found")
var ErrForbidden = errors.New("repository: forbidden")
