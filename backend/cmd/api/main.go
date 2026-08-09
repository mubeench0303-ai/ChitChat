package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/config"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/database"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/handler"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/router"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/ws"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/email"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/jwt"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx, stopBackgroundJobs := context.WithCancel(context.Background())
	defer stopBackgroundJobs()

	pool, err := database.NewPostgresPool(ctx, cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	userRepo := repository.NewUserRepository(pool)
	verificationRepo := repository.NewVerificationRepository(pool)
	conversationRepo := repository.NewConversationRepository(pool)
	statusRepo := repository.NewStatusRepository(pool)
	mailer := email.NewClient(
		cfg.SMTPHost,
		cfg.SMTPPort,
		cfg.SMTPEmail,
		cfg.SMTPPassword,
		cfg.SMTPFrom,
		cfg.SMTPFromName,
	)
	jwtHelper := jwt.NewHelper(cfg.JWTSecret, 24*time.Hour)
	cloudinaryClient := cloudinary.NewClient(
		cfg.CloudinaryCloudName,
		cfg.CloudinaryAPIKey,
		cfg.CloudinaryAPISecret,
	)
	authService := service.NewAuthService(
		pool,
		userRepo,
		conversationRepo,
		verificationRepo,
		mailer,
		cloudinaryClient,
		jwtHelper,
	)
	hub := ws.NewHub()
	notificationService := service.NewHubNotificationService(hub)
	conversationService := service.NewConversationService(
		userRepo,
		conversationRepo,
		statusRepo,
		notificationService,
		cloudinaryClient,
		authService,
	)
	statusService := service.NewStatusService(statusRepo, userRepo, authService)
	statusService.StartCleanupJob(ctx)
	authHandler := handler.NewAuthHandler(authService, userRepo)
	conversationHandler := handler.NewConversationHandler(conversationService, cloudinaryClient)
	statusHandler := handler.NewStatusHandler(statusService, cloudinaryClient)
	authMiddleware := middleware.NewAuthMiddleware(jwtHelper)

	allowedOrigins, err := cfg.AllowedOrigins()
	if err != nil {
		log.Fatalf("failed to load allowed origins: %v", err)
	}

	wsOriginPatterns, err := cfg.WSOriginPatterns()
	if err != nil {
		log.Fatalf("failed to load websocket origin patterns: %v", err)
	}

	srv := &http.Server{
		Addr: ":" + cfg.AppPort,
		Handler: router.New(
			authHandler,
			conversationHandler,
			statusHandler,
			conversationService,
			authService,
			authMiddleware,
			hub,
			jwtHelper,
			conversationRepo,
			userRepo,
			notificationService,
			allowedOrigins,
			wsOriginPatterns,
		),
	}

	go func() {
		log.Printf("server listening on :%s", cfg.AppPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")

	stopBackgroundJobs()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server shutdown failed: %v", err)
	}

	log.Println("server stopped")
}
