"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  Sparkles,
  UserRound,
} from "lucide-react";

const fieldClassName =
  "h-12 w-full border border-[#d7dbd3] bg-white px-10 text-sm text-[#1a302c] outline-none transition duration-200 placeholder:text-[#87918c] focus:border-[#ee7659] focus:ring-4 focus:ring-[#f9dfd6]";

const reveal = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 18 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

export default function SignupPreviewPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reduceMotion = useReducedMotion();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#f7f7f1] text-[#1a302c]">
      <div className="mx-auto grid min-h-dvh max-w-[1440px] lg:grid-cols-[minmax(0,1.04fr)_minmax(440px,0.96fr)]">
        <section className="relative hidden overflow-hidden bg-[#143f3a] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
          <motion.div aria-hidden className="absolute inset-x-0 top-0 h-2 bg-[#ee7659]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }} style={{ transformOrigin: "left" }} />
          <motion.div {...reveal(0.12, reduceMotion)}>
          <Link href="/" className="relative flex w-fit items-center gap-2.5 no-underline">
            <span className="grid size-9 place-items-center bg-[#ee7659] text-white">
              <MessageCircleMore className="size-5" strokeWidth={2.4} />
            </span>
            <span className="text-xl font-semibold tracking-[0]">chitchat</span>
          </Link>
          </motion.div>

          <div className="relative my-auto max-w-[580px] py-16">
            <motion.p {...reveal(0.2, reduceMotion)} className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#aad6c8]">
              <Sparkles className="size-4" /> A calmer way to connect
            </motion.p>
            <motion.h1 {...reveal(0.28, reduceMotion)} className="max-w-[540px] font-[Georgia,serif] text-5xl font-normal leading-[1.04] tracking-[0] xl:text-[64px]">
              Bring your people closer, one chat at a time.
            </motion.h1>
            <motion.p {...reveal(0.36, reduceMotion)} className="mt-6 max-w-[485px] text-base leading-7 text-[#c4dbd4]">
              A private space for the conversations, moments, and inside jokes that matter most.
            </motion.p>

            <motion.div {...reveal(0.48, reduceMotion)} whileHover={reduceMotion ? undefined : { y: -5, rotate: -0.4 }} className="mt-12 max-w-[440px] border border-white/15 bg-[#20504a] p-5 shadow-[8px_8px_0_#0d2f2b]">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center bg-[#f2bc5c] text-[#173d3a]">
                  <span className="text-sm font-bold">M</span>
                </div>
                <div>
                  <p className="text-sm font-semibold">Maya&apos;s circle</p>
                  <p className="text-xs text-[#a9c9c1]">5 members online</p>
                </div>
                <span className="ml-auto size-2 bg-[#85d6b8]" aria-label="Online" />
              </div>
              <div className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
                <div className="w-fit max-w-[85%] bg-white px-3 py-2 text-[#173d3a]">
                  Dinner at mine on Friday?
                </div>
                <div className="ml-auto w-fit max-w-[85%] bg-[#ee7659] px-3 py-2 text-white">
                  I&apos;m bringing dessert.
                </div>
              </div>
            </motion.div>
          </div>

          <motion.p {...reveal(0.6, reduceMotion)} className="relative text-xs text-[#9ac0b7]">Made for the people you already love talking to.</motion.p>
        </section>

        <section className="flex min-h-dvh items-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
          <motion.div initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-[460px]">
            <Link href="/" className="mb-12 flex w-fit items-center gap-2.5 no-underline lg:hidden">
              <span className="grid size-9 place-items-center bg-[#e96a4e] text-white">
                <MessageCircleMore className="size-5" strokeWidth={2.4} />
              </span>
              <span className="text-xl font-semibold tracking-[0] text-[#172329]">chitchat</span>
            </Link>

            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#68757a]">Create your space</p>
                <h2 className="mt-1 font-[Georgia,serif] text-[34px] font-normal leading-none tracking-[0] text-[#1a302c]">Join ChitChat</h2>
              </div>
              <Link href="/login" className="shrink-0 border-b border-[#172329] pb-0.5 text-sm font-semibold text-[#172329] no-underline hover:border-[#e96a4e] hover:text-[#e96a4e]">
                Sign in
              </Link>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#2c393d]">Your name</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[#6f7c80]" />
                  <input className={fieldClassName} name="name" placeholder="How should friends know you?" autoComplete="name" required />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#2c393d]">Email address</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[#6f7c80]" />
                  <input className={fieldClassName} name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#2c393d]">Create a password</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[#6f7c80]" />
                  <input className={fieldClassName} name="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-[#6f7c80] hover:text-[#172329] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e96a4e]">
                    {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                  </button>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#58666b]">
                <input type="checkbox" required className="mt-0.5 size-4 accent-[#e96a4e]" />
                <span>I agree to the <a className="font-semibold text-[#172329] underline decoration-[#e96a4e] underline-offset-2" href="#terms">Terms of Service</a> and <a className="font-semibold text-[#172329] underline decoration-[#e96a4e] underline-offset-2" href="#privacy">Privacy Policy</a>.</span>
              </label>

              <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }} type="submit" className="flex h-12 w-full items-center justify-center gap-2 bg-[#ee7659] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#da6248] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a302c]">
                {submitted ? <><Check className="size-[18px]" /> Preview submitted</> : <>Create account <ArrowRight className="size-[18px]" /></>}
              </motion.button>
            </form>

            <div className="my-7 flex items-center gap-3 text-xs text-[#8a9598]" aria-hidden>
              <span className="h-px flex-1 bg-[#d8dddf]" /> OR <span className="h-px flex-1 bg-[#d8dddf]" />
            </div>

            <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }} type="button" className="flex h-12 w-full items-center justify-center gap-3 border border-[#cbd3d4] bg-white text-sm font-semibold text-[#2c393d] transition-colors duration-200 hover:border-[#809094] hover:bg-[#fbfcfa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7659]">
              <span className="grid size-5 place-items-center bg-[#f2bc5c] text-xs font-bold text-[#172329]">G</span>
              Continue with Google
            </motion.button>
            <p className="mt-7 text-center text-xs leading-5 text-[#7a878b]">This is a design preview. No account will be created from this page.</p>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
