# SOA Training Platform

## What this is
A Medicare Advantage sales training platform for 100+ agents. Agents practice handling objections from leads who call in after misleading TV ads (food cards, stimulus checks, scooters). The platform trains them specifically on the Intro/SOA step where we lose 15-20% of leads.

## Stack
- Frontend: React + Vite, will be hosted on Netlify
- Backend: PocketBase v0.27.2 running at http://127.0.0.1:8090 (same server)
- Styling: CSS with CSS variables, no Tailwind
- Routing: react-router-dom
- PocketBase JS SDK: already installed as "pocketbase" package

## PocketBase Collections (already created)
- users (auth collection) — email, name, role (agent|supervisor), supervisor_id, certification_level, status (active|inactive|suspended)
- objections — text, category (select), difficulty (1-4), source (field|written|generated), call_stage (intro_soa|qualifying|presenting|closing), active
- lessons — title, week_number, order_index, content_url, content_text, bloom_level (remember|understand|apply|analyze), est_minutes, active
- quiz_questions — question_text, difficulty (1-4), options (json array), correct_index, explanation, lesson_id, objection_id
- lesson_completions — agent_id, lesson_id, quiz_score, attempts, passed, completed_at
- practice_sessions — agent_id, session_type (multiple_choice|free_text|mixed), difficulty_level, call_stage, total_score, max_score, passed
- session_responses — session_id, objection_id, response_type (multiple_choice|free_text), response_text, selected_option, score, max_score, feedback, time_seconds

## Agent Scripts (must be displayed in training)
Intro: "Hi (Client Name)? My name is (Agent First & Last Name), I am a licensed agent with (company name), for your protection I am required to let you know that this call may be monitored, recorded, and may also be shared with insurance companies who administer plans we offer. Plans are insured or covered by a Medicare Advantage organization with a Medicare contract and/or a Medicare approved Part D sponsor. Enrollment in the plan depends on contract renewal with Medicare. Now to confirm, I have your number as (Client Phone Number) and If we get disconnected (Client Name) do I have your permission to call you back at this number? Thank you."

SOA: "Before we proceed, I want to let you know that (Company Name) offers Medicare Advantage plans and Stand-Alone Prescription Drug plan options. We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Currently we represent (# of carriers) organizations which offer (# of plans) plans in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program to get information on all of your options. Do I have your permission to discuss all plan types that (Company Name) offers to find the benefits that fit your needs?"

## Key Rules
- No AI APIs for grading — all grading is rule-based keyword matching and scoring
- Multiple choice: compare selected option index against correct_index field
- Free text: score against a rubric of required keywords/phrases per objection category
- Agents cannot skip ahead — each lesson unlocks only after previous lesson passed at 85%+
- Two user roles: agent sees own data only, supervisor sees all managed agents
- Certification requires both 85%+ quiz AND 3.0/4.0+ practice score
- Mobile-first responsive design

## Pages
- /login — email + password auth via PocketBase
- /dashboard — agent home (cert level, progress, weak spots, next lesson)
- /lessons — lesson list with lock/unlock
- /lessons/:id — lesson player + quiz
- /practice — objection practice arena, pick difficulty + stage
- /practice/session — live practice session
- /progress — scores, history, weakness breakdown
- /supervisor — supervisor dashboard (agent table, flags, scores)
- /supervisor/agent/:id — individual agent detail

## Commands
- npm run dev — local dev server
- npm run build — production build for Netlify
