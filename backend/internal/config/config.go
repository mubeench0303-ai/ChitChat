package config

import (
	"bytes"
	"fmt"
	"net/url"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	AppPort     string
	FrontendURL string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	JWTSecret string

	PingramAPIKey             string
	PingramRegion             string
	PingramFromName           string
	PingramFromAddress        string
	PingramEmailVerifyType    string
	PingramPasswordResetType  string

	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

func LoadConfig() (*Config, error) {
	if err := loadEnvFile(".env"); err != nil {
		return nil, fmt.Errorf("config: failed to load .env: %w", err)
	}

	cfg := &Config{
		AppPort:     getEnv("APP_PORT", "8080"),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
		DBHost:      getEnv("DB_HOST", "localhost"),
		DBPort:      getEnv("DB_PORT", "5432"),
		DBUser:      getEnv("DB_USER", "postgres"),
		DBPassword:  getEnv("DB_PASSWORD", ""),
		DBName:      getEnv("DB_NAME", "chitchat"),
		DBSSLMode:   getEnv("DB_SSLMODE", "disable"),
		JWTSecret:    getEnv("JWT_SECRET", ""),
		PingramAPIKey:            getEnv("PINGRAM_API_KEY", ""),
		PingramRegion:            getEnv("PINGRAM_REGION", "us"),
		PingramFromName:          getEnv("PINGRAM_FROM_NAME", "ChitChat"),
		PingramFromAddress:       getEnv("PINGRAM_FROM_ADDRESS", ""),
		PingramEmailVerifyType:   getEnv("PINGRAM_EMAIL_VERIFY_TYPE", "email_verify"),
		PingramPasswordResetType: getEnv("PINGRAM_PASSWORD_RESET_TYPE", "password_reset"),
		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
	}

	if cfg.DBPassword == "" {
		return nil, fmt.Errorf("config: DB_PASSWORD is required")
	}

	if cfg.DBName == "" {
		return nil, fmt.Errorf("config: DB_NAME is required")
	}

	if _, err := cfg.AllowedOrigins(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) AllowedOrigins() ([]string, error) {
	parsed, err := url.Parse(c.FrontendURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("config: invalid FRONTEND_URL %q", c.FrontendURL)
	}

	return []string{c.FrontendURL}, nil
}

func (c *Config) WSOriginPatterns() ([]string, error) {
	parsed, err := url.Parse(c.FrontendURL)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("config: invalid FRONTEND_URL %q", c.FrontendURL)
	}

	return []string{parsed.Host}, nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func loadEnvFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	// Windows editors (Notepad, VS Code on save) may write UTF-8 with BOM.
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})

	envMap, err := godotenv.Parse(bytes.NewReader(data))
	if err != nil {
		return err
	}

	for key, value := range envMap {
		if err := os.Setenv(key, value); err != nil {
			return err
		}
	}

	return nil
}
