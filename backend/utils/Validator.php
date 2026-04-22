<?php
/**
 * C.O.E.D.I.G.O. - Input Validator
 */

class Validator {
    private $errors = [];

    public function required($field, $value, $label = null) {
        $label = $label ?: $field;
        if (empty($value) && $value !== '0' && $value !== 0) {
            $this->errors[$field] = "$label is required.";
        }
        return $this;
    }

    public function email($field, $value) {
        if (!empty($value) && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = "Invalid email address.";
        }
        return $this;
    }

    public function minLength($field, $value, $min, $label = null) {
        $label = $label ?: $field;
        if (!empty($value) && strlen($value) < $min) {
            $this->errors[$field] = "$label must be at least $min characters.";
        }
        return $this;
    }

    public function maxLength($field, $value, $max, $label = null) {
        $label = $label ?: $field;
        if (!empty($value) && strlen($value) > $max) {
            $this->errors[$field] = "$label must not exceed $max characters.";
        }
        return $this;
    }

    public function inArray($field, $value, $allowed, $label = null) {
        $label = $label ?: $field;
        if (!empty($value) && !in_array($value, $allowed)) {
            $this->errors[$field] = "Invalid $label value.";
        }
        return $this;
    }

    public function numeric($field, $value, $label = null) {
        $label = $label ?: $field;
        if (!empty($value) && !is_numeric($value)) {
            $this->errors[$field] = "$label must be a number.";
        }
        return $this;
    }

    public function isValid() {
        return empty($this->errors);
    }

    public function getErrors() {
        return $this->errors;
    }
}
