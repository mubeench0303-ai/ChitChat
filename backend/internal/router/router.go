package router

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/handler"
	authmiddleware "github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/ws"
	jwthelper "github.com/mubeench0303-ai/ChitChat/backend/pkg/jwt"
)

func New(
	authHandler *handler.AuthHandler,
	conversationHandler *handler.ConversationHandler,
	conversationService *service.ConversationService,
	authMiddleware *authmiddleware.AuthMiddleware,
	hub *ws.Hub,
	jwtHelper *jwthelper.Helper,
	conversationRepo *repository.ConversationRepository,
	userRepo *repository.UserRepository,
	notifier ws.UserNotifier,
	allowedOrigins []string,
	wsOriginPatterns []string,
) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(authmiddleware.CORS(allowedOrigins))

	r.Get("/ws", ws.ServeWS(hub, jwtHelper, wsOriginPatterns, conversationRepo, userRepo, notifier, conversationService))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		api.Route("/auth", func(auth chi.Router) {
			auth.Post("/signup", authHandler.Signup)
			auth.Post("/verify-email", authHandler.VerifyEmail)
			auth.Post("/login", authHandler.Login)
			auth.Post("/resend-verification", authHandler.ResendVerification)
			auth.Post("/forgot-password", authHandler.ForgotPassword)
			auth.Post("/reset-password", authHandler.ResetPassword)
			auth.Post("/logout", authHandler.Logout)

			auth.Group(func(protected chi.Router) {
				protected.Use(authMiddleware.RequireAuth)
				protected.Get("/me", authHandler.Me)
				protected.Get("/check-username", authHandler.CheckUsername)
				protected.Patch("/profile/avatar", authHandler.UpdateAvatar)
				protected.Delete("/profile/avatar", authHandler.RemoveAvatar)
				protected.Patch("/profile", authHandler.UpdateProfile)
			})
		})

		api.Group(func(protected chi.Router) {
			protected.Use(authMiddleware.RequireAuth)
			protected.Get("/users/search", authHandler.SearchUsers)
			protected.Get("/users/{username}", authHandler.GetPublicProfile)
			protected.Post("/messages/request", conversationHandler.SendMessageRequest)
			protected.Get("/messages/requests", conversationHandler.GetIncomingRequests)
			protected.Post("/messages/requests/{conversationId}/accept", conversationHandler.AcceptRequest)
			protected.Post("/messages/requests/{conversationId}/reject", conversationHandler.RejectRequest)
			protected.Post("/messages/requests/{conversationId}/block", conversationHandler.BlockRequest)
			protected.Get("/chats", conversationHandler.GetChatList)
			protected.Get("/conversations/{conversationId}/messages", conversationHandler.GetMessages)
			protected.Post("/conversations/{conversationId}/messages", conversationHandler.SendMessage)
			protected.Post("/conversations/{conversationId}/read", conversationHandler.MarkRead)
			protected.Delete("/messages/{messageId}/for-me", conversationHandler.DeleteMessageForMe)
			protected.Patch("/messages/{messageId}", conversationHandler.EditMessage)
			protected.Post("/messages/{messageId}/unsend", conversationHandler.UnsendMessage)
			protected.Post("/messages/{messageId}/reactions", conversationHandler.ToggleReaction)
			protected.Delete("/conversations/{conversationId}", conversationHandler.RemoveConnection)
			protected.Post("/conversations/{conversationId}/block", conversationHandler.BlockConnection)
			protected.Post("/groups", conversationHandler.CreateGroup)
			protected.Get("/groups/{conversationId}", conversationHandler.GetGroupInfo)
			protected.Patch("/groups/{conversationId}", conversationHandler.UpdateGroupInfo)
			protected.Patch("/groups/{conversationId}/avatar", conversationHandler.UpdateGroupAvatar)
			protected.Post("/groups/{conversationId}/members", conversationHandler.AddGroupMembers)
			protected.Delete("/groups/{conversationId}/members/{userId}", conversationHandler.RemoveGroupMember)
			protected.Post("/groups/{conversationId}/leave", conversationHandler.LeaveGroup)
			protected.Patch("/groups/{conversationId}/members/{userId}/role", conversationHandler.UpdateMemberRole)
		})
	})

	return r
}
