--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: abilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abilities (
    id text NOT NULL,
    story_id text NOT NULL,
    character_id text,
    name text NOT NULL,
    type text,
    description text,
    power_level double precision,
    attributes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: arcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arcs (
    id text NOT NULL,
    story_id text NOT NULL,
    name text NOT NULL,
    order_index integer NOT NULL,
    summary text,
    start_chapter_id text,
    end_chapter_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id text NOT NULL,
    story_id text NOT NULL,
    generation_output_id text,
    type text NOT NULL,
    uri text NOT NULL,
    meta jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapters (
    id text NOT NULL,
    story_id text NOT NULL,
    number integer NOT NULL,
    title text,
    raw_text text,
    clean_text text,
    content_hash text,
    word_count integer,
    status text DEFAULT 'imported'::text NOT NULL,
    imported_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id text NOT NULL,
    story_id text NOT NULL,
    name text NOT NULL,
    aliases text[] DEFAULT ARRAY[]::text[],
    role text,
    summary text,
    attributes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: event_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_characters (
    event_id text NOT NULL,
    character_id text NOT NULL,
    role text NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id text NOT NULL,
    story_id text NOT NULL,
    chapter_id text NOT NULL,
    arc_id text,
    type text,
    summary text NOT NULL,
    importance integer DEFAULT 0 NOT NULL,
    timeline_order integer,
    payload jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: generation_outputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generation_outputs (
    id text NOT NULL,
    story_id text NOT NULL,
    chapter_id text,
    arc_id text,
    type text NOT NULL,
    prompt_template_id text,
    prompt_version integer,
    input_ref jsonb,
    content text,
    content_json jsonb,
    status text DEFAULT 'ready'::text NOT NULL,
    tokens_in integer,
    tokens_out integer,
    cost_usd double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id text NOT NULL,
    story_id text NOT NULL,
    name text NOT NULL,
    type text,
    description text,
    owner_character_id text,
    attributes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    story_id text,
    payload jsonb,
    result jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp(3) without time zone,
    finished_at timestamp(3) without time zone
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id text NOT NULL,
    story_id text NOT NULL,
    name text NOT NULL,
    type text,
    description text,
    attributes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: plot_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plot_signals (
    id text NOT NULL,
    story_id text NOT NULL,
    chapter_id text NOT NULL,
    kind text NOT NULL,
    text text NOT NULL,
    strength integer DEFAULT 0 NOT NULL,
    payload jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    style_guide jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_templates (
    id text NOT NULL,
    key text NOT NULL,
    version integer NOT NULL,
    locale text DEFAULT 'vi'::text NOT NULL,
    body text NOT NULL,
    model_hint text,
    output_schema jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationships (
    id text NOT NULL,
    story_id text NOT NULL,
    from_character_id text NOT NULL,
    to_character_id text NOT NULL,
    type text NOT NULL,
    description text,
    since_chapter_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_items (
    id text NOT NULL,
    source_id text NOT NULL,
    external_key text NOT NULL,
    title text NOT NULL,
    url text,
    published_at timestamp(3) without time zone,
    genre text[] DEFAULT ARRAY[]::text[],
    trend_score double precision,
    metadata jsonb,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sources (
    id text NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    base_url text,
    license_status text DEFAULT 'pending'::text NOT NULL,
    config jsonb,
    last_synced_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stories (
    id text NOT NULL,
    project_id text NOT NULL,
    source_id text,
    title text NOT NULL,
    language text DEFAULT 'vi'::text NOT NULL,
    genre text[] DEFAULT ARRAY[]::text[],
    tags text[] DEFAULT ARRAY[]::text[],
    status text DEFAULT 'draft'::text NOT NULL,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: story_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_chunks (
    id text NOT NULL,
    chapter_id text NOT NULL,
    ordinal integer NOT NULL,
    text text NOT NULL,
    token_estimate integer,
    embedding public.vector(1536),
    content_hash text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: timeline_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_entries (
    id text NOT NULL,
    story_id text NOT NULL,
    event_id text NOT NULL,
    "position" integer NOT NULL,
    label text
);


--
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id text NOT NULL,
    job_id text,
    provider text NOT NULL,
    model text NOT NULL,
    tokens_in integer,
    tokens_out integer,
    cost_usd double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    role text DEFAULT 'editor'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    password_hash text
);


--
-- Name: viral_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viral_boards (
    id text NOT NULL,
    project_id text NOT NULL,
    board_key text NOT NULL,
    label text NOT NULL,
    genre text NOT NULL,
    genres_extra text[] DEFAULT ARRAY[]::text[],
    adapter_config jsonb,
    enabled boolean DEFAULT true NOT NULL,
    crawl_interval_sec integer DEFAULT 3600 NOT NULL,
    last_crawled_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: viral_crawl_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viral_crawl_runs (
    id text NOT NULL,
    board_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp(3) without time zone,
    item_count integer,
    error text,
    meta jsonb
);


--
-- Name: viral_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viral_items (
    id text NOT NULL,
    board_id text NOT NULL,
    external_id text NOT NULL,
    rank_position integer,
    title text NOT NULL,
    caption text,
    author_handle text,
    stats jsonb,
    hashtags text[] DEFAULT ARRAY[]::text[],
    cover_url text,
    canonical_url text,
    published_at timestamp(3) without time zone,
    crawled_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    genres text[] DEFAULT ARRAY[]::text[],
    genre_confidence double precision,
    genre_source text,
    trend_score double precision,
    tier text,
    usage_policy text DEFAULT 'research_only'::text NOT NULL,
    raw_payload jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: viral_remakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viral_remakes (
    id text NOT NULL,
    project_id text NOT NULL,
    viral_item_id text,
    external_video_id text NOT NULL,
    source_url text,
    source_snapshot jsonb,
    genre text,
    status text DEFAULT 'pending'::text NOT NULL,
    usage_policy text DEFAULT 'remix_draft'::text NOT NULL,
    package_json jsonb,
    policy_checklist jsonb,
    policy_warnings text[] DEFAULT ARRAY[]::text[],
    editor_notes text,
    approved_by_user_id text,
    approved_at timestamp(3) without time zone,
    tokens_in integer,
    tokens_out integer,
    cost_usd double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    script_mode text DEFAULT 'caption'::text NOT NULL,
    pipeline_phase text DEFAULT 'pending'::text NOT NULL,
    source_transcript jsonb,
    media_audio_key text,
    media_expires_at timestamp without time zone,
    video_duration_sec double precision,
    stt_cost_usd double precision,
    source_transcript_translated jsonb
);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
f11c8ecf-5a37-46dc-beb2-2680d9db3613	ebd4fa99fbf6e498332b3c024fd21d855a4a8955ddaa1c42a7f3d9ebc15e517f	2026-07-14 23:24:41.828723+07	20260710074145_init	\N	\N	2026-07-14 23:24:41.105063+07	1
fb857d45-ffba-4520-97cb-b5115bb39bd5	972dab2e27bdbb1fab8d0e897b03c707aba7e5cfff6b19e33e2688b7b670b891	2026-07-14 23:24:41.832763+07	20260710145200_add_user_password_hash	\N	\N	2026-07-14 23:24:41.829794+07	1
e76f0d75-9389-4345-aa38-0121b26fcefd	bd316f8a38db7733d172666df1bfd23b37562d51b0572bf38e1717e37b1120a9	2026-07-15 00:44:57.598772+07	20260714165000_add_viral_remakes	\N	\N	2026-07-15 00:44:57.40063+07	1
5d63d66f-0dc8-485c-b364-e43d477dd90f	b70b71d93c9930ae9b92aa6041c538d82159ed0f0e949b095801146c547acd64	2026-07-15 21:36:46.685662+07	20260715100000_add_remix_transcript_media	\N	\N	2026-07-15 21:36:46.618111+07	1
c5f49dc3-61b3-4e69-bff1-54184541d54b	b463c90a818f953c038707af5b2f30b47c4d03ba7f2d38f75e758034336feeda	2026-07-15 21:36:46.689964+07	20260715120000_add_remix_transcript_translated	\N	\N	2026-07-15 21:36:46.686601+07	1
\.


--
-- Data for Name: abilities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.abilities (id, story_id, character_id, name, type, description, power_level, attributes, created_at) FROM stdin;
\.


--
-- Data for Name: arcs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.arcs (id, story_id, name, order_index, summary, start_chapter_id, end_chapter_id, created_at) FROM stdin;
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assets (id, story_id, generation_output_id, type, uri, meta, created_at) FROM stdin;
\.


--
-- Data for Name: chapters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chapters (id, story_id, number, title, raw_text, clean_text, content_hash, word_count, status, imported_at, created_at) FROM stdin;
\.


--
-- Data for Name: characters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.characters (id, story_id, name, aliases, role, summary, attributes, created_at) FROM stdin;
\.


--
-- Data for Name: event_characters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_characters (event_id, character_id, role) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, story_id, chapter_id, arc_id, type, summary, importance, timeline_order, payload, created_at) FROM stdin;
\.


--
-- Data for Name: generation_outputs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.generation_outputs (id, story_id, chapter_id, arc_id, type, prompt_template_id, prompt_version, input_ref, content, content_json, status, tokens_in, tokens_out, cost_usd, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items (id, story_id, name, type, description, owner_character_id, attributes, created_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jobs (id, type, status, priority, story_id, payload, result, attempts, max_attempts, error, created_at, started_at, finished_at) FROM stdin;
cmrkxm46a000d7kj8wv7lhrqh	douyin_rank_crawl	failed	0	\N	{"manual": true, "boardId": "cmrkxlvxx000b7kj8t1o9avoc", "idempotencyKey": "douyin_rank_crawl:cmrkxlvxx000b7kj8t1o9avoc:manual:1784050515862"}	\N	1	3	DOUYIN_LIVE_ADAPTER_MODULE must be set when DOUYIN_ADAPTER=live. Install the studio-provided live adapter plugin separately; this repository does not ship ToS-bypass crawl code.	2026-07-14 17:35:15.873	2026-07-14 17:35:15.897	2026-07-14 17:35:15.989
cmrkxm750000f7kj85bu1hqha	douyin_rank_crawl	failed	0	\N	{"manual": true, "boardId": "cmrkxlvxx000b7kj8t1o9avoc", "idempotencyKey": "douyin_rank_crawl:cmrkxlvxx000b7kj8t1o9avoc:manual:1784050519696"}	\N	1	3	DOUYIN_LIVE_ADAPTER_MODULE must be set when DOUYIN_ADAPTER=live. Install the studio-provided live adapter plugin separately; this repository does not ship ToS-bypass crawl code.	2026-07-14 17:35:19.705	2026-07-14 17:35:19.723	2026-07-14 17:35:19.733
cmrkybnmf000b7kykcajom8qv	douyin_rank_crawl	completed	0	\N	{"manual": true, "boardId": "cmrkxlvxx000b7kj8t1o9avoc", "idempotencyKey": "douyin_rank_crawl:cmrkxlvxx000b7kj8t1o9avoc:manual:1784051707463"}	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "itemCount": 5, "crawlRunId": "cmrkybnq5000b7kkw33j9eo2k"}	1	3	\N	2026-07-14 17:55:07.479	2026-07-14 17:55:07.528	2026-07-14 17:55:07.678
cmrkybnrq000n7kkw1u6k8kpq	douyin_genre_classify	completed	0	\N	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "itemIds": ["cmrkybnqm000d7kkw4zabivmg", "cmrkybnqz000f7kkwot0zrnox", "cmrkybnr3000h7kkwttjg8ior", "cmrkybnr9000j7kkw88yw1sus", "cmrkybnrg000l7kkwwwdbmyty"], "crawlRunId": "cmrkybnq5000b7kkw33j9eo2k", "previousStatsByItemId": {}}	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "updated": 5}	1	3	\N	2026-07-14 17:55:07.67	2026-07-14 17:55:07.686	2026-07-14 17:55:07.72
cmrkybnt2000p7kkw33turyyu	douyin_tier_score	completed	0	\N	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "crawlRunId": "cmrkybnq5000b7kkw33j9eo2k", "previousStatsByItemId": {}}	{"scored": 5, "boardId": "cmrkxlvxx000b7kj8t1o9avoc"}	1	3	\N	2026-07-14 17:55:07.719	2026-07-14 17:55:07.725	2026-07-14 17:55:07.745
cmrkyc67x000f7kykinxmscsf	remix_fetch_detail	active	0	\N	{"videoId": "fake-4fdac3d2aa3e", "remakeId": "cmrkyc67t000d7kyk50rsu12i"}	\N	1	3	\N	2026-07-14 17:55:31.581	2026-07-14 17:55:31.59	\N
cmrkyhxg600137kkwhw0mr6uo	douyin_genre_classify	completed	0	\N	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "itemIds": ["cmrkybnqm000d7kkw4zabivmg", "cmrkybnqz000f7kkwot0zrnox", "cmrkybnr3000h7kkwttjg8ior", "cmrkybnr9000j7kkw88yw1sus", "cmrkybnrg000l7kkwwwdbmyty"], "crawlRunId": "cmrkyhxf7000r7kkw2n80g1g8", "previousStatsByItemId": {"cmrkybnqm000d7kkw4zabivmg": {"likes": 11337, "shares": 59, "comments": 117}, "cmrkybnqz000f7kkwot0zrnox": {"likes": 12674, "shares": 68, "comments": 134}, "cmrkybnr3000h7kkwttjg8ior": {"likes": 14011, "shares": 77, "comments": 151}, "cmrkybnr9000j7kkw88yw1sus": {"likes": 15348, "shares": 86, "comments": 168}, "cmrkybnrg000l7kkwwwdbmyty": {"likes": 16685, "shares": 95, "comments": 185}}}	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "updated": 5}	1	3	\N	2026-07-14 18:00:00.15	2026-07-14 18:00:00.155	2026-07-14 18:00:00.173
cmrkyhxgs00157kkwjzwed0w7	douyin_tier_score	completed	0	\N	{"boardId": "cmrkxlvxx000b7kj8t1o9avoc", "crawlRunId": "cmrkyhxf7000r7kkw2n80g1g8", "previousStatsByItemId": {"cmrkybnqm000d7kkw4zabivmg": {"likes": 11337, "shares": 59, "comments": 117}, "cmrkybnqz000f7kkwot0zrnox": {"likes": 12674, "shares": 68, "comments": 134}, "cmrkybnr3000h7kkwttjg8ior": {"likes": 14011, "shares": 77, "comments": 151}, "cmrkybnr9000j7kkw88yw1sus": {"likes": 15348, "shares": 86, "comments": 168}, "cmrkybnrg000l7kkwwwdbmyty": {"likes": 16685, "shares": 95, "comments": 185}}}	{"scored": 5, "boardId": "cmrkxlvxx000b7kj8t1o9avoc"}	1	3	\N	2026-07-14 18:00:00.172	2026-07-14 18:00:00.177	2026-07-14 18:00:00.19
cmrm7j3me000e7k40n8kqvisx	douyin_rank_crawl	completed	0	\N	{"manual": true, "boardId": "cmrm7j3js000c7k40877h1gk0", "idempotencyKey": "douyin_rank_crawl:cmrm7j3js000c7k40877h1gk0:manual:1784127637498"}	{"boardId": "cmrm7j3js000c7k40877h1gk0", "itemCount": 10, "crawlRunId": "cmrm7j3rl000c7k4gmmtdonjq"}	1	3	\N	2026-07-15 15:00:37.526	2026-07-15 15:00:37.597	2026-07-15 15:00:41.04
cmrm7j655000g7k40qaje4gbq	douyin_rank_crawl	completed	0	\N	{"manual": true, "boardId": "cmrm7j3js000c7k40877h1gk0", "idempotencyKey": "douyin_rank_crawl:cmrm7j3js000c7k40877h1gk0:manual:1784127640781"}	{"boardId": "cmrm7j3js000c7k40877h1gk0", "itemCount": 10, "crawlRunId": "cmrm7j6ce00107k4gpa3nw14x"}	1	3	\N	2026-07-15 15:00:40.793	2026-07-15 15:00:41.049	2026-07-15 15:00:42.854
cmrm7ji4g001o7k4g801znrx3	douyin_tier_score	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "crawlRunId": "cmrm7j3rl000c7k4gmmtdonjq", "previousStatsByItemId": {}}	{"scored": 10, "boardId": "cmrm7j3js000c7k40877h1gk0"}	1	3	\N	2026-07-15 15:00:56.32	2026-07-15 15:01:13.214	2026-07-15 15:01:13.244
cmrm7j6bv000y7k4gq132ddh3	douyin_genre_classify	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "itemIds": ["cmrm7j69y000e7k4gueqkpgz9", "cmrm7j6a9000g7k4gu0fbvfrq", "cmrm7j6af000i7k4gr00chfok", "cmrm7j6an000k7k4gs27aron5", "cmrm7j6at000m7k4geqarqcg2", "cmrm7j6b3000o7k4gyjwpfv8r", "cmrm7j6b8000q7k4g4r9rxnu2", "cmrm7j6be000s7k4gno3qgobt", "cmrm7j6bi000u7k4g5et62prw", "cmrm7j6bn000w7k4gmu3pi6tu"], "crawlRunId": "cmrm7j3rl000c7k4gmmtdonjq", "previousStatsByItemId": {}}	{"boardId": "cmrm7j3js000c7k40877h1gk0", "updated": 10}	1	3	\N	2026-07-15 15:00:41.035	2026-07-15 15:00:42.859	2026-07-15 15:00:56.321
cmrm7j7qd001m7k4gbe97ufk0	douyin_genre_classify	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "itemIds": ["cmrm7j69y000e7k4gueqkpgz9", "cmrm7j6a9000g7k4gu0fbvfrq", "cmrm7j6af000i7k4gr00chfok", "cmrm7j6an000k7k4gs27aron5", "cmrm7j6at000m7k4geqarqcg2", "cmrm7j6b3000o7k4gyjwpfv8r", "cmrm7j6b8000q7k4g4r9rxnu2", "cmrm7j6be000s7k4gno3qgobt", "cmrm7j6bi000u7k4g5et62prw", "cmrm7j6bn000w7k4gmu3pi6tu"], "crawlRunId": "cmrm7j6ce00107k4gpa3nw14x", "previousStatsByItemId": {"cmrm7j69y000e7k4gueqkpgz9": {"likes": 725904, "shares": 105099, "comments": 7993}, "cmrm7j6a9000g7k4gu0fbvfrq": {"likes": 370010, "shares": 77524, "comments": 4631}, "cmrm7j6af000i7k4gr00chfok": {"likes": 331621, "shares": 38224, "comments": 1459}, "cmrm7j6an000k7k4gs27aron5": {"likes": 254920, "shares": 102383, "comments": 2457}, "cmrm7j6at000m7k4geqarqcg2": {"likes": 290548, "shares": 52890, "comments": 1995}, "cmrm7j6b3000o7k4gyjwpfv8r": {"likes": 282759, "shares": 31403, "comments": 2046}, "cmrm7j6b8000q7k4g4r9rxnu2": {"likes": 244899, "shares": 36131, "comments": 1177}, "cmrm7j6be000s7k4gno3qgobt": {"likes": 209052, "shares": 35570, "comments": 4614}, "cmrm7j6bi000u7k4g5et62prw": {"likes": 136527, "shares": 494, "comments": 99405}, "cmrm7j6bn000w7k4gmu3pi6tu": {"likes": 223268, "shares": 11841, "comments": 495}}}	{"boardId": "cmrm7j3js000c7k40877h1gk0", "updated": 10}	1	3	\N	2026-07-15 15:00:42.853	2026-07-15 15:00:56.326	2026-07-15 15:01:13.21
cmrm7jv5l001q7k4gdyopputi	douyin_tier_score	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "crawlRunId": "cmrm7j6ce00107k4gpa3nw14x", "previousStatsByItemId": {"cmrm7j69y000e7k4gueqkpgz9": {"likes": 725904, "shares": 105099, "comments": 7993}, "cmrm7j6a9000g7k4gu0fbvfrq": {"likes": 370010, "shares": 77524, "comments": 4631}, "cmrm7j6af000i7k4gr00chfok": {"likes": 331621, "shares": 38224, "comments": 1459}, "cmrm7j6an000k7k4gs27aron5": {"likes": 254920, "shares": 102383, "comments": 2457}, "cmrm7j6at000m7k4geqarqcg2": {"likes": 290548, "shares": 52890, "comments": 1995}, "cmrm7j6b3000o7k4gyjwpfv8r": {"likes": 282759, "shares": 31403, "comments": 2046}, "cmrm7j6b8000q7k4g4r9rxnu2": {"likes": 244899, "shares": 36131, "comments": 1177}, "cmrm7j6be000s7k4gno3qgobt": {"likes": 209052, "shares": 35570, "comments": 4614}, "cmrm7j6bi000u7k4g5et62prw": {"likes": 136527, "shares": 494, "comments": 99405}, "cmrm7j6bn000w7k4gmu3pi6tu": {"likes": 223268, "shares": 11841, "comments": 495}}}	{"scored": 10, "boardId": "cmrm7j3js000c7k40877h1gk0"}	1	3	\N	2026-07-15 15:01:13.209	2026-07-15 15:01:13.247	2026-07-15 15:01:13.274
cmrm7z1kq000k7k40pn0jy01d	remix_fetch_detail	completed	0	\N	{"videoId": "7651984682527631281", "remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	1	3	\N	2026-07-15 15:13:01.37	2026-07-15 15:13:01.421	2026-07-15 15:13:03.308
cmrm7z323001s7k4ghw63iyxj	remix_download_media	failed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	\N	1	3	Failed to read media body from https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r: terminated	2026-07-15 15:13:03.291	2026-07-15 15:13:03.313	2026-07-15 15:15:26.589
cmrm8ti1m000m7k4069krojfm	remix_download_media	failed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y", "idempotencyKey": "remix_download_media:cmrm7z1k2000i7k40cyzw5f5y:1784129802355"}	\N	1	3	connect ECONNREFUSED 127.0.0.1:9000	2026-07-15 15:36:42.392	2026-07-15 15:36:42.45	2026-07-15 15:38:49.889
cmrm9njso002g7k4glhuk8s94	douyin_genre_classify	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "itemIds": ["cmrm7j69y000e7k4gueqkpgz9", "cmrm7j6a9000g7k4gu0fbvfrq", "cmrm7j6af000i7k4gr00chfok", "cmrm7j6an000k7k4gs27aron5", "cmrm7j6at000m7k4geqarqcg2", "cmrm7j6b3000o7k4gyjwpfv8r", "cmrm7j6b8000q7k4g4r9rxnu2", "cmrm7j6be000s7k4gno3qgobt", "cmrm7j6bi000u7k4g5et62prw", "cmrm7j6bn000w7k4gmu3pi6tu"], "crawlRunId": "cmrm9ngj5001u7k4g3oaorges", "previousStatsByItemId": {"cmrm7j69y000e7k4gueqkpgz9": {"likes": 725904, "shares": 105099, "comments": 7993}, "cmrm7j6a9000g7k4gu0fbvfrq": {"likes": 370010, "shares": 77524, "comments": 4631}, "cmrm7j6af000i7k4gr00chfok": {"likes": 331621, "shares": 38224, "comments": 1459}, "cmrm7j6an000k7k4gs27aron5": {"likes": 254920, "shares": 102383, "comments": 2457}, "cmrm7j6at000m7k4geqarqcg2": {"likes": 290548, "shares": 52890, "comments": 1995}, "cmrm7j6b3000o7k4gyjwpfv8r": {"likes": 282759, "shares": 31403, "comments": 2046}, "cmrm7j6b8000q7k4g4r9rxnu2": {"likes": 244899, "shares": 36131, "comments": 1177}, "cmrm7j6be000s7k4gno3qgobt": {"likes": 209052, "shares": 35570, "comments": 4614}, "cmrm7j6bi000u7k4g5et62prw": {"likes": 136527, "shares": 494, "comments": 99405}, "cmrm7j6bn000w7k4gmu3pi6tu": {"likes": 223268, "shares": 11841, "comments": 495}}}	{"boardId": "cmrm7j3js000c7k40877h1gk0", "updated": 10}	1	3	\N	2026-07-15 16:00:04.344	2026-07-15 16:00:04.358	2026-07-15 16:00:19.698
cmrm9mu2s000o7k40jo12qawt	remix_download_media	failed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y", "idempotencyKey": "remix_download_media:cmrm7z1k2000i7k40cyzw5f5y:1784131170979"}	\N	1	3	The specified bucket does not exist	2026-07-15 15:59:31.009	2026-07-15 15:59:31.195	2026-07-15 16:00:42.83
cmrm9nvn2002i7k4g8lr95j6s	douyin_tier_score	completed	0	\N	{"boardId": "cmrm7j3js000c7k40877h1gk0", "crawlRunId": "cmrm9ngj5001u7k4g3oaorges", "previousStatsByItemId": {"cmrm7j69y000e7k4gueqkpgz9": {"likes": 725904, "shares": 105099, "comments": 7993}, "cmrm7j6a9000g7k4gu0fbvfrq": {"likes": 370010, "shares": 77524, "comments": 4631}, "cmrm7j6af000i7k4gr00chfok": {"likes": 331621, "shares": 38224, "comments": 1459}, "cmrm7j6an000k7k4gs27aron5": {"likes": 254920, "shares": 102383, "comments": 2457}, "cmrm7j6at000m7k4geqarqcg2": {"likes": 290548, "shares": 52890, "comments": 1995}, "cmrm7j6b3000o7k4gyjwpfv8r": {"likes": 282759, "shares": 31403, "comments": 2046}, "cmrm7j6b8000q7k4g4r9rxnu2": {"likes": 244899, "shares": 36131, "comments": 1177}, "cmrm7j6be000s7k4gno3qgobt": {"likes": 209052, "shares": 35570, "comments": 4614}, "cmrm7j6bi000u7k4g5et62prw": {"likes": 136527, "shares": 494, "comments": 99405}, "cmrm7j6bn000w7k4gmu3pi6tu": {"likes": 223268, "shares": 11841, "comments": 495}}}	{"scored": 10, "boardId": "cmrm7j3js000c7k40877h1gk0"}	1	3	\N	2026-07-15 16:00:19.695	2026-07-15 16:00:19.703	2026-07-15 16:00:19.748
cmrm9vpmx000q7k40e4py2w4s	remix_download_media	completed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y", "idempotencyKey": "remix_download_media:cmrm7z1k2000i7k40cyzw5f5y:1784131585121"}	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	1	3	\N	2026-07-15 16:06:25.156	2026-07-15 16:06:25.2	2026-07-15 16:06:46.387
cmrm9w60e002k7k4gqu4ry1n2	remix_stt	completed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	1	3	\N	2026-07-15 16:06:46.382	2026-07-15 16:06:46.393	2026-07-15 16:07:33.444
cmrm9x6bb002m7k4g96zm14qy	remix_translate	completed	0	\N	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y", "chainGenerate": false}	{"remakeId": "cmrm7z1k2000i7k40cyzw5f5y"}	1	3	\N	2026-07-15 16:07:33.431	2026-07-15 16:07:33.448	2026-07-15 16:08:23.172
cmrntnbja000c7kx83bmroi5g	douyin_rank_crawl	failed	0	\N	{"manual": true, "boardId": "cmrm7j3js000c7k40877h1gk0", "idempotencyKey": "douyin_rank_crawl:cmrm7j3js000c7k40877h1gk0:manual:1784225252095"}	\N	1	3	Just One API error 301: COLLECT FAILED, SEND REQUEST AGAIN (board douyin:hot:movie_recap)	2026-07-16 18:07:32.131	2026-07-16 18:07:32.267	2026-07-16 18:07:33.795
cmrntnup7000g7kx8ag9md123	douyin_rank_crawl	failed	0	\N	{"manual": true, "boardId": "cmrntnuo1000e7kx8ty528vca", "idempotencyKey": "douyin_rank_crawl:cmrntnuo1000e7kx8ty528vca:manual:1784225276962"}	\N	1	3	Just One API error 301: COLLECT FAILED, SEND REQUEST AGAIN (board douyin:hot:anime_recap)	2026-07-16 18:07:56.971	2026-07-16 18:07:56.976	2026-07-16 18:08:02.596
cmrntrhrl000i7kx86v0yvd6z	douyin_rank_crawl	completed	0	\N	{"manual": true, "boardId": "cmrntnuo1000e7kx8ty528vca", "idempotencyKey": "douyin_rank_crawl:cmrntnuo1000e7kx8ty528vca:manual:1784225446824"}	{"boardId": "cmrntnuo1000e7kx8ty528vca", "itemCount": 10, "crawlRunId": "cmrntrhrw000g7kysf37eji4p"}	1	3	\N	2026-07-16 18:10:46.832	2026-07-16 18:10:46.838	2026-07-16 18:10:51.447
cmrntrlbm00127kysv4ouuq9c	douyin_genre_classify	completed	0	\N	{"boardId": "cmrntnuo1000e7kx8ty528vca", "itemIds": ["cmrntrl8p000i7kysuu6792hq", "cmrntrl9r000k7kyslr53w947", "cmrntrl9z000m7kys43r0l74u", "cmrntrla5000o7kysvgcgm139", "cmrntrlad000q7kysr1r2ct7q", "cmrntrlaj000s7kysyrrh6erq", "cmrntrlaq000u7kysljp0n7e4", "cmrntrlaw000w7kys9rqy7sou", "cmrntrlb1000y7kys0p4a7hr7", "cmrntrlb600107kys88pcoxgb"], "crawlRunId": "cmrntrhrw000g7kysf37eji4p", "previousStatsByItemId": {}}	{"boardId": "cmrntnuo1000e7kx8ty528vca", "updated": 10}	1	3	\N	2026-07-16 18:10:51.442	2026-07-16 18:10:51.452	2026-07-16 18:11:03.297
cmrntrugv00147kys31q8b2px	douyin_tier_score	completed	0	\N	{"boardId": "cmrntnuo1000e7kx8ty528vca", "crawlRunId": "cmrntrhrw000g7kysf37eji4p", "previousStatsByItemId": {}}	{"scored": 10, "boardId": "cmrntnuo1000e7kx8ty528vca"}	1	3	\N	2026-07-16 18:11:03.295	2026-07-16 18:11:03.3	2026-07-16 18:11:03.336
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locations (id, story_id, name, type, description, attributes, created_at) FROM stdin;
\.


--
-- Data for Name: plot_signals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plot_signals (id, story_id, chapter_id, kind, text, strength, payload, created_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, name, slug, style_guide, created_at) FROM stdin;
cmrkxhf9900097kj8ranyxte2	My Novel Factory	my-novel-factory	\N	2026-07-14 17:31:36.957
\.


--
-- Data for Name: prompt_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prompt_templates (id, key, version, locale, body, model_hint, output_schema, active, created_at) FROM stdin;
cmrkvjoz700017k30gyym1nwk	summary.chapter	1	vi	Viết tóm tắt chương bằng tiếng Việt, 150–300 từ, dựa trên ngữ cảnh sau.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.635
cmrkvjozj00027k306mhjze5s	summary.arc	1	vi	Viết tóm tắt cung truyện bằng tiếng Việt, 200–400 từ.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.648
cmrkvjozm00037k30ilepcczn	script.narration	1	vi	Viết kịch bản thuyết minh tiếng Việt cho video recap, giọng kể hấp dẫn.\n\n{{context}}	strong	\N	t	2026-07-14 16:37:23.651
cmrkvjozo00047k30sax5630j	outline.video	1	vi	Lập dàn ý video recap (beats có thứ tự) bằng tiếng Việt.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.653
cmrkvjozq00057k30km88x1ny	pack.title	1	vi	Đề xuất 3 tiêu đề video Douyin/TikTok bằng tiếng Việt cho "{{story_title}}".\n\n{{context}}	strong	\N	t	2026-07-14 16:37:23.655
cmrkvjozt00067k30d8bidvu2	pack.thumbnail_text	1	vi	Viết 3 dòng text thumbnail ngắn, gây tò mò, tiếng Việt.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.657
cmrkvjozv00077k30ym4hrn0w	pack.description	1	vi	Viết mô tả video 1–2 câu tiếng Việt kèm CTA.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.66
cmrkvjozz00087k30o238q7ub	pack.tags	1	vi	Đề xuất 8–12 hashtag tiếng Việt dạng JSON array chuỗi.\n\n{{context}}	mid	\N	t	2026-07-14 16:37:23.663
cmrkvjp0100097k30l8aw1ezb	pack.hook_3s	1	vi	Viết hook mở đầu 3 giây đầu video, 1–2 câu tiếng Việt.\n\n{{context}}	strong	\N	t	2026-07-14 16:37:23.665
cmrnm6pse00097kx8wjouu8p6	remix.package.v1	2	vi	Bạn là chuyên gia đóng gói video recap tiếng Việt cho Douyin/TikTok.\n\nQuy tắc bắt buộc:\n- Toàn bộ output phải bằng tiếng Việt.\n- Tạo banners (top, bottom, watermark) tiếng Việt phù hợp thể loại và nội dung caption.\n- Tạo packaging: titles (3 biến thể), description, hashtags tiếng Việt.\n- Tạo subtitles SRT tiếng Việt từ caption; timing ước lượng (estimated) theo độ dài nội dung.\n- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.\n- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.\n- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.\n- Trả về JSON đúng schema remix.package.v1, không kèm markdown.\n\nSchema JSON:\n{\n  "locale": "vi",\n  "banners": {\n    "top": "string",\n    "bottom": "string",\n    "watermark": "string"\n  },\n  "packaging": {\n    "titles": [\n      "string"\n    ],\n    "description": "string",\n    "hashtags": [\n      "string"\n    ]\n  },\n  "subtitles": {\n    "format": "srt",\n    "cues": [\n      {\n        "start": "HH:MM:SS,mmm",\n        "end": "HH:MM:SS,mmm",\n        "text": "string"\n      }\n    ]\n  },\n  "transform_notes": {\n    "source_language": "string",\n    "rewrite_strategy": "string",\n    "risks": [\n      "string"\n    ]\n  }\n}	strong	{"locale": "vi", "banners": {"top": "string", "bottom": "string", "watermark": "string"}, "packaging": {"titles": ["string"], "hashtags": ["string"], "description": "string"}, "subtitles": {"cues": [{"end": "HH:MM:SS,mmm", "text": "string", "start": "HH:MM:SS,mmm"}], "format": "srt"}, "transform_notes": {"risks": ["string"], "source_language": "string", "rewrite_strategy": "string"}}	t	2026-07-16 14:38:40.142
cmrkxtd9a00097ktsuee5t074	remix.package.v1	1	vi	Bạn là biên kịch video recap tiếng Việt cho Douyin/TikTok.\n\nQuy tắc bắt buộc:\n- Toàn bộ output phải bằng tiếng Việt.\n- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.\n- Hook spoken phải gây chú ý ngay, ≤ 3 giây khi đọc ở tốc độ bình thường.\n- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.\n- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.\n- Trả về JSON đúng schema remix.package.v1, không kèm markdown.\n\nSchema JSON:\n{\n  "locale": "vi",\n  "script": {\n    "narration": "string",\n    "duration_estimate_sec": "number",\n    "sections": [\n      {\n        "label": "string",\n        "text": "string"\n      }\n    ]\n  },\n  "hook_3s": {\n    "spoken": "string (≤3s spoken)",\n    "on_screen": "string",\n    "visual_hint": "string"\n  },\n  "banners": {\n    "top": "string",\n    "bottom": "string",\n    "watermark": "string"\n  },\n  "packaging": {\n    "titles": [\n      "string"\n    ],\n    "description": "string",\n    "hashtags": [\n      "string"\n    ]\n  },\n  "subtitles": {\n    "format": "srt",\n    "cues": [\n      {\n        "start": "HH:MM:SS,mmm",\n        "end": "HH:MM:SS,mmm",\n        "text": "string"\n      }\n    ]\n  },\n  "transform_notes": {\n    "source_language": "string",\n    "rewrite_strategy": "string",\n    "risks": [\n      "string"\n    ]\n  }\n}	strong	{"locale": "vi", "script": {"sections": [{"text": "string", "label": "string"}], "narration": "string", "duration_estimate_sec": "number"}, "banners": {"top": "string", "bottom": "string", "watermark": "string"}, "hook_3s": {"spoken": "string (≤3s spoken)", "on_screen": "string", "visual_hint": "string"}, "packaging": {"titles": ["string"], "hashtags": ["string"], "description": "string"}, "subtitles": {"cues": [{"end": "HH:MM:SS,mmm", "text": "string", "start": "HH:MM:SS,mmm"}], "format": "srt"}, "transform_notes": {"risks": ["string"], "source_language": "string", "rewrite_strategy": "string"}}	t	2026-07-14 17:40:54.238
cmrm6nc2y000a7krcoj2jcbaz	remix.package.v2	1	vi	Bạn là biên kịch video recap tiếng Việt cho Douyin/TikTok.\n\nQuy tắc bắt buộc:\n- Toàn bộ output phải bằng tiếng Việt.\n- Bạn nhận TRANSCRIPT đầy đủ của video (có timestamp từng đoạn).\n- Viết narration tiếng Việt recap TOÀN BỘ nội dung video, không bỏ sót đoạn quan trọng.\n- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.\n- Độ dài narration tối thiểu: source_duration_sec × 10 ký tự.\n- subtitles.cues phải bám timing STT (start/end giữ nguyên hoặc chỉnh nhẹ ≤500ms).\n- subtitles.timing_source phải là "stt".\n- Hook spoken phải gây chú ý ngay, ≤ 3 giây khi đọc ở tốc độ bình thường.\n- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.\n- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.\n- Trả về JSON đúng schema remix.package.v2, không kèm markdown.\n\nSchema JSON:\n{\n  "locale": "vi",\n  "script": {\n    "narration": "string (cover entire video)",\n    "duration_estimate_sec": "number (≈ source_duration_sec)",\n    "sections": [\n      {\n        "label": "string",\n        "text": "string"\n      }\n    ]\n  },\n  "hook_3s": {\n    "spoken": "string (≤3s spoken)",\n    "on_screen": "string",\n    "visual_hint": "string"\n  },\n  "banners": {\n    "top": "string",\n    "bottom": "string",\n    "watermark": "string"\n  },\n  "packaging": {\n    "titles": [\n      "string"\n    ],\n    "description": "string",\n    "hashtags": [\n      "string"\n    ]\n  },\n  "subtitles": {\n    "format": "srt",\n    "timing_source": "estimated | stt",\n    "cues": [\n      {\n        "start": "HH:MM:SS,mmm",\n        "end": "HH:MM:SS,mmm",\n        "text": "string"\n      }\n    ]\n  },\n  "transform_notes": {\n    "input_mode": "transcript_full",\n    "source_duration_sec": "number",\n    "source_language": "string",\n    "rewrite_strategy": "string",\n    "risks": [\n      "string"\n    ]\n  }\n}	strong	{"locale": "vi", "script": {"sections": [{"text": "string", "label": "string"}], "narration": "string (cover entire video)", "duration_estimate_sec": "number (≈ source_duration_sec)"}, "banners": {"top": "string", "bottom": "string", "watermark": "string"}, "hook_3s": {"spoken": "string (≤3s spoken)", "on_screen": "string", "visual_hint": "string"}, "packaging": {"titles": ["string"], "hashtags": ["string"], "description": "string"}, "subtitles": {"cues": [{"end": "HH:MM:SS,mmm", "text": "string", "start": "HH:MM:SS,mmm"}], "format": "srt", "timing_source": "estimated | stt"}, "transform_notes": {"risks": ["string"], "input_mode": "transcript_full", "source_language": "string", "rewrite_strategy": "string", "source_duration_sec": "number"}}	t	2026-07-15 14:35:55.498
cmrnm6pyi000a7kx8ij486bvd	remix.package.v2	2	vi	Bạn là chuyên gia đóng gói video recap tiếng Việt cho Douyin/TikTok.\n\nQuy tắc bắt buộc:\n- Toàn bộ output phải bằng tiếng Việt.\n- Bạn nhận TRANSCRIPT đầy đủ của video (có timestamp từng đoạn).\n- Tạo banners (top, bottom, watermark) tiếng Việt phù hợp thể loại và nội dung transcript.\n- Tạo packaging: titles (3 biến thể), description, hashtags tiếng Việt.\n- Tạo subtitles SRT tiếng Việt từ transcript; subtitles.cues phải bám timing STT (start/end giữ nguyên hoặc chỉnh nhẹ ≤500ms).\n- subtitles.timing_source phải là "stt".\n- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.\n- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.\n- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.\n- Trả về JSON đúng schema remix.package.v2, không kèm markdown.\n\nSchema JSON:\n{\n  "locale": "vi",\n  "banners": {\n    "top": "string",\n    "bottom": "string",\n    "watermark": "string"\n  },\n  "packaging": {\n    "titles": [\n      "string"\n    ],\n    "description": "string",\n    "hashtags": [\n      "string"\n    ]\n  },\n  "subtitles": {\n    "format": "srt",\n    "timing_source": "estimated | stt",\n    "cues": [\n      {\n        "start": "HH:MM:SS,mmm",\n        "end": "HH:MM:SS,mmm",\n        "text": "string"\n      }\n    ]\n  },\n  "transform_notes": {\n    "input_mode": "transcript_full",\n    "source_duration_sec": "number",\n    "source_language": "string",\n    "rewrite_strategy": "string",\n    "risks": [\n      "string"\n    ]\n  }\n}	strong	{"locale": "vi", "banners": {"top": "string", "bottom": "string", "watermark": "string"}, "packaging": {"titles": ["string"], "hashtags": ["string"], "description": "string"}, "subtitles": {"cues": [{"end": "HH:MM:SS,mmm", "text": "string", "start": "HH:MM:SS,mmm"}], "format": "srt", "timing_source": "estimated | stt"}, "transform_notes": {"risks": ["string"], "input_mode": "transcript_full", "source_language": "string", "rewrite_strategy": "string", "source_duration_sec": "number"}}	t	2026-07-16 14:38:40.363
\.


--
-- Data for Name: relationships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.relationships (id, story_id, from_character_id, to_character_id, type, description, since_chapter_id, created_at) FROM stdin;
\.


--
-- Data for Name: source_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.source_items (id, source_id, external_key, title, url, published_at, genre, trend_score, metadata, status, created_at) FROM stdin;
\.


--
-- Data for Name: sources; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sources (id, project_id, name, type, base_url, license_status, config, last_synced_at, created_at) FROM stdin;
\.


--
-- Data for Name: stories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stories (id, project_id, source_id, title, language, genre, tags, status, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: story_chunks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.story_chunks (id, chapter_id, ordinal, text, token_estimate, embedding, content_hash, created_at) FROM stdin;
\.


--
-- Data for Name: timeline_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timeline_entries (id, story_id, event_id, "position", label) FROM stdin;
\.


--
-- Data for Name: usage_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usage_events (id, job_id, provider, model, tokens_in, tokens_out, cost_usd, created_at) FROM stdin;
cmrm9x6bf002o7k4g64dzugyu	cmrm9w60e002k7k4gqu4ry1n2	openai	whisper-1	\N	\N	0.041479	2026-07-15 16:07:33.435
cmrm9y8oy002q7k4guntgc35r	cmrm9x6bb002m7k4g96zm14qy	llm	openai/gpt-5.6-luna	3122	3247	0.0024165	2026-07-15 16:08:23.17
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, role, created_at, password_hash) FROM stdin;
cmrkvjoyq00007k30xt6r50s4	studio@local.test	Studio	admin	2026-07-14 16:37:23.619	$2b$10$qgB2cU9JFrhzqaMjiZjZleOVEMo22pzcHZVC3cd6QXU9Z2a7UOc3i
\.


--
-- Data for Name: viral_boards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.viral_boards (id, project_id, board_key, label, genre, genres_extra, adapter_config, enabled, crawl_interval_sec, last_crawled_at, created_at) FROM stdin;
cmrkxlvxx000b7kj8t1o9avoc	cmrkxhf9900097kj8ranyxte2	douyin:hot:manhwa_recap	Manhwa Recap Hot	manhwa_recap	{}	\N	t	3600	\N	2026-07-14 17:35:05.203
cmrm7j3js000c7k40877h1gk0	cmrkxhf9900097kj8ranyxte2	douyin:hot:movie_recap	move	movie_recap	{}	\N	t	3600	2026-07-15 16:00:04.339	2026-07-15 15:00:37.431
cmrntnuo1000e7kx8ty528vca	cmrkxhf9900097kj8ranyxte2	douyin:hot:anime_recap	anime	anime_recap	{}	\N	t	3600	2026-07-16 18:10:51.431	2026-07-16 18:07:56.929
\.


--
-- Data for Name: viral_crawl_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.viral_crawl_runs (id, board_id, status, started_at, finished_at, item_count, error, meta) FROM stdin;
cmrm7j3rl000c7k4gmmtdonjq	cmrm7j3js000c7k40877h1gk0	completed	2026-07-15 15:00:37.713	2026-07-15 15:00:41.028	10	\N	{"manual": true, "boardKey": "douyin:hot:movie_recap", "scheduled": false}
cmrm7j6ce00107k4gpa3nw14x	cmrm7j3js000c7k40877h1gk0	completed	2026-07-15 15:00:41.054	2026-07-15 15:00:42.847	10	\N	{"manual": true, "boardKey": "douyin:hot:movie_recap", "scheduled": false}
cmrm9ngj5001u7k4g3oaorges	cmrm7j3js000c7k40877h1gk0	completed	2026-07-15 16:00:00.112	2026-07-15 16:00:04.332	10	\N	{"manual": false, "boardKey": "douyin:hot:movie_recap", "scheduled": true}
cmrntnbq7000c7kysaxe8j546	cmrm7j3js000c7k40877h1gk0	failed	2026-07-16 18:07:32.383	2026-07-16 18:07:33.777	\N	Just One API error 301: COLLECT FAILED, SEND REQUEST AGAIN (board douyin:hot:movie_recap)	\N
cmrntnupi000e7kyszj7vvjwz	cmrntnuo1000e7kx8ty528vca	failed	2026-07-16 18:07:56.982	2026-07-16 18:08:02.592	\N	Just One API error 301: COLLECT FAILED, SEND REQUEST AGAIN (board douyin:hot:anime_recap)	\N
cmrntrhrw000g7kysf37eji4p	cmrntnuo1000e7kx8ty528vca	completed	2026-07-16 18:10:46.844	2026-07-16 18:10:51.429	10	\N	{"manual": true, "boardKey": "douyin:hot:anime_recap", "scheduled": false}
\.


--
-- Data for Name: viral_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.viral_items (id, board_id, external_id, rank_position, title, caption, author_handle, stats, hashtags, cover_url, canonical_url, published_at, crawled_at, genres, genre_confidence, genre_source, trend_score, tier, usage_policy, raw_payload, created_at) FROM stdin;
cmrntrla5000o7kysvgcgm139	cmrntnuo1000e7kx8ty528vca	7660085033222376756	4	乖乖女和假混混，你就崛起吧#熏香花朵凛然绽放 #动漫解说 #二次元#日漫#动漫人物志	乖乖女和假混混，你就崛起吧#熏香花朵凛然绽放 #动漫解说 #二次元#日漫#动漫人物志	@知意动漫	{"likes": 1099717, "shares": 123639, "comments": 22524}	{熏香花朵凛然绽放,动漫解说,二次元,日漫,动漫人物志}	https://p3.douyinpic.com/img/tos-cn-p-0015/o4E3IwXfe1i7dNApBhBOcsiwisWJgA6Iy9FjIA~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7660085033222376756	2026-07-08 09:22:15	2026-07-16 18:10:51.387	{anime_recap}	0.95	ai	0.533	B	research_only	{"raw": {"id": "7660085033222376756", "user_info": {"name": "知意动漫", "follower": "43028", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_o8XXImFzARG80xuvBADAQ1Lp7qUAfEABAfEQfk.jpeg?from=3782654143", "core_user_id": "1383629845970314"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "13379501", "item_title": "乖乖女和假混混，你就崛起吧#熏香花朵凛然绽放 #动漫解说 #二次元#日漫#动漫人物志", "finish_rate": "0.055879", "core_user_id": "1383629845970314", "interact_cnt": "1245880", "is_star_item": "0", "like_cnt_all": "1099717", "interact_rate": "0.093119", "quality_score": "100.0", "share_cnt_all": "123639", "comment_cnt_all": "22524", "cover_image_uri": "tos-cn-p-0015/o4E3IwXfe1i7dNApBhBOcsiwisWJgA6Iy9FjIA", "v2_first_tag_id": "[607]", "item_create_time": "1783502535", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.389
cmrm7j6be000s7k4gno3qgobt	cmrm7j3js000c7k40877h1gk0	7650865645483003151	8	为什么以前的爱情可以持续那么久？ 从前车马很慢，书信很远，一句“你要老婆不要”，惦记了44年的川渝温柔，成就了一部国产好片，一生只爱一个人，爱的只是这个人！#牧马人 ##国产好剧 #影视经典补全计划 #了不起的精讲团 #电影解说	为什么以前的爱情可以持续那么久？ 从前车马很慢，书信很远，一句“你要老婆不要”，惦记了44年的川渝温柔，成就了一部国产好片，一生只爱一个人，爱的只是这个人！#牧马人 ##国产好剧 #影视经典补全计划 #了不起的精讲团 #电影解说	@啊卜	{"likes": 209052, "shares": 35570, "comments": 4614}	{牧马人,国产好剧,影视经典补全计划,了不起的精讲团,电影解说}	\N	https://www.douyin.com/video/7650865645483003151	2026-06-13 13:06:26	2026-07-15 16:00:04.3	{movie_recap}	0.9	ai	0.455	A	research_only	{"raw": {"id": "7650865645483003151", "user_info": {"name": "啊卜", "star_id": "7353529450954227749", "follower": "30985", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_og1BvAGAeIBAbCZNGBEAbyzyAaCfhAbqCgdLRu.jpeg?from=3782654143", "core_user_id": "3246235333699053"}, "object_type": 2, "attribute_datas": {"score": "1.5315", "vv_all": "4537610", "item_title": "为什么以前的爱情可以持续那么久？ 从前车马很慢，书信很远，一句“你要老婆不要”，惦记了44年的川渝温柔，成就了一部国产好片，一生只爱一个人，爱的只是这个人！#牧马人 ##国产好剧 #影视经典补全计划 #了不起的精讲团 #电影解说", "finish_rate": "0.026853", "core_user_id": "3246235333699053", "interact_cnt": "249236", "is_star_item": "0", "like_cnt_all": "209052", "interact_rate": "0.054927", "quality_score": "93.333333", "share_cnt_all": "35570", "star_author_id": "7353529450954227749", "comment_cnt_all": "4614", "cover_image_uri": "tos-cn-p-0015/oonWe8B3IiHsb9wAUVqAtBXBLIrFNXLfgAjik9", "v2_first_tag_id": "[604]", "item_create_time": "1781355986", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:41.018
cmrntrlaq000u7kysljp0n7e4	cmrntnuo1000e7kx8ty528vca	7659990543732116762	7	原来这就是原版吗，听完已摊在了工位上 #nightdancer #翻唱 #二次元 #在超市后门吸烟的二人 #我在抖音看动漫	原来这就是原版吗，听完已摊在了工位上 #nightdancer #翻唱 #二次元 #在超市后门吸烟的二人 #我在抖音看动漫	@异世界赤石英雄	{"likes": 373573, "shares": 473855, "comments": 8747}	{nightdancer,翻唱,二次元,在超市后门吸烟的二人,我在抖音看动漫}	https://p3.douyinpic.com/img/tos-cn-p-0015/osIB1JC0GnDtABjFIpfACxhAiJD4Nh1Iggviev~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7659990543732116762	2026-07-08 03:15:31	2026-07-16 18:10:51.408	{anime_recap}	0.85	ai	0.516	B	research_only	{"raw": {"id": "7659990543732116762", "user_info": {"name": "异世界赤石英雄", "follower": "123425", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-c9aec8xkvj_13ae9cf37d554d30a5e73376667f845b.jpeg?from=3782654143", "core_user_id": "4259920796192116"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "7872216", "item_title": "原来这就是原版吗，听完已摊在了工位上 #nightdancer #翻唱 #二次元 #在超市后门吸烟的二人 #我在抖音看动漫", "finish_rate": "0.015315", "core_user_id": "4259920796192116", "interact_cnt": "856175", "is_star_item": "0", "like_cnt_all": "373573", "interact_rate": "0.108759", "quality_score": "100.0", "share_cnt_all": "473855", "comment_cnt_all": "8747", "cover_image_uri": "tos-cn-p-0015/osIB1JC0GnDtABjFIpfACxhAiJD4Nh1Iggviev", "v2_first_tag_id": "[607]", "item_create_time": "1783480531", "v2_second_tag_id": "[60704]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.41
cmrntrlaj000s7kysyrrh6erq	cmrntnuo1000e7kx8ty528vca	7657927532112579891	6	“《油脂》算是伊藤润二作品里让很难忘记的代表作了，他用夸张的画面张力，表达了一个在封闭环境下成长的兄妹；哥哥五郎因为偏执的性格走向了陌路，但妹妹小唯却在混乱的环境中保持着理智，这也是他能脱离环境最大的原因”#伊藤润二惊选集 #伊藤润二 #恐怖片 #恐怖片解说 #抖音午夜放映厅	“《油脂》算是伊藤润二作品里让很难忘记的代表作了，他用夸张的画面张力，表达了一个在封闭环境下成长的兄妹；哥哥五郎因为偏执的性格走向了陌路，但妹妹小唯却在混乱的环境中保持着理智，这也是他能脱离环境最大的原因”#伊藤润二惊选集 #伊藤润二 #恐怖片 #恐怖片解说 #抖音午夜放映厅	@简单说	{"likes": 315186, "shares": 699185, "comments": 21529}	{伊藤润二惊选集,伊藤润二,恐怖片,恐怖片解说,抖音午夜放映厅}	https://p3.douyinpic.com/img/tos-cn-p-0015/oUAEHisde2SgeJ4laUGedgf5oOetIaLAJRYHUB~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7657927532112579891	2026-07-02 13:50:07	2026-07-16 18:10:51.401	{anime_recap,movie_recap}	0.85	ai	0.58	A	research_only	{"raw": {"id": "7657927532112579891", "user_info": {"name": "简单说", "star_id": "7384798436349968421", "follower": "272767", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-c9aec8xkvj_d681ce2bb4a744fdb9994b743eb6fdaf.jpeg?from=3782654143", "core_user_id": "851453452237555"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "8071553", "item_title": "“《油脂》算是伊藤润二作品里让很难忘记的代表作了，他用夸张的画面张力，表达了一个在封闭环境下成长的兄妹；哥哥五郎因为偏执的性格走向了陌路，但妹妹小唯却在混乱的环境中保持着理智，这也是他能脱离环境最大的原因”#伊藤润二惊选集 #伊藤润二 #恐怖片 #恐怖片解说 #抖音午夜放映厅", "finish_rate": "0.012068", "core_user_id": "851453452237555", "interact_cnt": "1035900", "is_star_item": "0", "like_cnt_all": "315186", "interact_rate": "0.12834", "quality_score": "100.0", "share_cnt_all": "699185", "star_author_id": "7384798436349968421", "comment_cnt_all": "21529", "cover_image_uri": "tos-cn-p-0015/oUAEHisde2SgeJ4laUGedgf5oOetIaLAJRYHUB", "v2_first_tag_id": "[607]", "item_create_time": "1783000207", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.403
cmrm7j6at000m7k4geqarqcg2	cmrm7j3js000c7k40877h1gk0	7659375743796890922	5	一口气看过瘾，由李秉宪、宋康昊、全度妍联袂演绎的灾难大片， 被誉为空难版釜山行《非常宣言》#有点东西月刊企划 #了不起的精讲团 #电影解说 #青年创作者扶持计划	一口气看过瘾，由李秉宪、宋康昊、全度妍联袂演绎的灾难大片， 被誉为空难版釜山行《非常宣言》#有点东西月刊企划 #了不起的精讲团 #电影解说 #青年创作者扶持计划	@路人乙.	{"likes": 290548, "shares": 52890, "comments": 1995}	{有点东西月刊企划,了不起的精讲团,电影解说,青年创作者扶持计划}	\N	https://www.douyin.com/video/7659375743796890922	2026-07-06 11:29:53	2026-07-15 16:00:04.278	{movie_recap}	0.95	ai	0.448	B	research_only	{"raw": {"id": "7659375743796890922", "user_info": {"name": "路人乙.", "star_id": "7379295468037079103", "follower": "366847", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_os7xEN7EUzAKOTAkAZfBAeyACAngOC62IctKzh.jpeg?from=3782654143", "core_user_id": "1154935745952074"}, "object_type": 2, "attribute_datas": {"score": "1.5034", "vv_all": "12340357", "item_title": "一口气看过瘾，由李秉宪、宋康昊、全度妍联袂演绎的灾难大片， 被誉为空难版釜山行《非常宣言》#有点东西月刊企划 #了不起的精讲团 #电影解说 #青年创作者扶持计划", "finish_rate": "0.023775", "core_user_id": "1154935745952074", "interact_cnt": "345433", "is_star_item": "0", "like_cnt_all": "290548", "interact_rate": "0.027992", "quality_score": "90.0", "share_cnt_all": "52890", "star_author_id": "7379295468037079103", "comment_cnt_all": "1995", "cover_image_uri": "tos-cn-p-0015/okA6IiNQTkI1AiBQBT4aL1PChQKux8YAsIivo", "v2_first_tag_id": "[604]", "item_create_time": "1783337393", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:40.997
cmrm7j6b3000o7k4gyjwpfv8r	cmrm7j3js000c7k40877h1gk0	7659470701799214374	6	1965年意大利经典老电影《黄昏双镖客》。 #电影解说 #影视解说 #老电影	1965年意大利经典老电影《黄昏双镖客》。 #电影解说 #影视解说 #老电影	@九条猫讲影	{"likes": 282759, "shares": 31403, "comments": 2046}	{电影解说,影视解说,老电影}	\N	https://www.douyin.com/video/7659470701799214374	2026-07-06 17:38:25	2026-07-15 16:00:04.287	{movie_recap}	0.95	ai	0.398	B	research_only	{"raw": {"id": "7659470701799214374", "user_info": {"name": "九条猫讲影", "star_id": "7346574752745521203", "follower": "376399", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813_oQE5IAAAexinAZzyufAJNx12MNAArhAgN4OtC8.jpeg?from=3782654143", "core_user_id": "2876774027902135"}, "object_type": 2, "attribute_datas": {"score": "1.5034", "vv_all": "8241874", "item_title": "1965年意大利经典老电影《黄昏双镖客》。 #电影解说 #影视解说 #老电影", "finish_rate": "0.035465", "core_user_id": "2876774027902135", "interact_cnt": "316208", "is_star_item": "0", "like_cnt_all": "282759", "interact_rate": "0.038366", "quality_score": "90.0", "share_cnt_all": "31403", "star_author_id": "7346574752745521203", "comment_cnt_all": "2046", "cover_image_uri": "tos-cn-p-0015/o4kL9fZcqIDTAQA55BSi8VKiI7BCmQAhXgfZmO", "v2_first_tag_id": "[604]", "item_create_time": "1783359505", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:41.007
cmrntrlaw000w7kys9rqy7sou	cmrntnuo1000e7kx8ty528vca	7651205143198715186	8	间谍过家家：两个小苦瓜守护另一个小苦瓜的故事 #间谍过家家 #番剧 #充能计划 #动漫编年史 #我在抖音看动漫	间谍过家家：两个小苦瓜守护另一个小苦瓜的故事 #间谍过家家 #番剧 #充能计划 #动漫编年史 #我在抖音看动漫	@二次元小祥	{"likes": 812716, "shares": 32512, "comments": 2167}	{间谍过家家,番剧,充能计划,动漫编年史,我在抖音看动漫}	https://p3.douyinpic.com/img/tos-cn-p-0015/o0QBdLUXRCgsBaGlQeIe3ECAIREqGXeHZZJA7m~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7651205143198715186	2026-06-14 11:03:48	2026-07-16 18:10:51.414	{anime_recap}	0.95	ai	0.504	B	research_only	{"raw": {"id": "7651205143198715186", "user_info": {"name": "二次元小祥", "star_id": "7015405266900353065", "follower": "499861", "avatar_url": "https://p26.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_d16e93d2a30fad325e271c6596f60579.jpeg?from=3782654143", "core_user_id": "3218977597437007"}, "object_type": 2, "attribute_datas": {"score": "1.5034", "vv_all": "9645392", "item_title": "间谍过家家：两个小苦瓜守护另一个小苦瓜的故事 #间谍过家家 #番剧 #充能计划 #动漫编年史 #我在抖音看动漫", "finish_rate": "0.073066", "core_user_id": "3218977597437007", "interact_cnt": "847395", "is_star_item": "0", "like_cnt_all": "812716", "interact_rate": "0.087855", "quality_score": "90.0", "share_cnt_all": "32512", "star_author_id": "7015405266900353065", "comment_cnt_all": "2167", "cover_image_uri": "tos-cn-p-0015/o0QBdLUXRCgsBaGlQeIe3ECAIREqGXeHZZJA7m", "v2_first_tag_id": "[607]", "item_create_time": "1781435028", "v2_second_tag_id": "[60704]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.416
cmrntrlb1000y7kys0p4a7hr7	cmrntnuo1000e7kx8ty528vca	7658762226274290982	9	七月新番：猫妈妈意外被人类女孩召唤到魔法学校 #动漫解说#动漫推荐#治愈动漫#我在抖音看动漫	七月新番：猫妈妈意外被人类女孩召唤到魔法学校 #动漫解说#动漫推荐#治愈动漫#我在抖音看动漫	@三爷追漫	{"likes": 788554, "shares": 41369, "comments": 2821}	{动漫解说,动漫推荐,治愈动漫,我在抖音看动漫}	https://p3.douyinpic.com/img/tos-cn-p-0015/oEX4GyCgIiuSWnzALY1AJB5BJIJwN6afgA7ite~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7658762226274290982	2026-07-04 19:49:14	2026-07-16 18:10:51.419	{anime_recap}	0.9	ai	0.491	C	research_only	{"raw": {"id": "7658762226274290982", "user_info": {"name": "三爷追漫", "star_id": "7332756074233069578", "follower": "1059246", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813_o0EALysAnCdAMgerI5IACfhA2uzqMxAsstw12N.jpeg?from=3782654143", "core_user_id": "820683010489321"}, "object_type": 2, "attribute_datas": {"score": "1.5034", "vv_all": "14615366", "item_title": "七月新番：猫妈妈意外被人类女孩召唤到魔法学校 #动漫解说#动漫推荐#治愈动漫#我在抖音看动漫", "finish_rate": "0.092474", "core_user_id": "820683010489321", "interact_cnt": "832744", "is_star_item": "0", "like_cnt_all": "788554", "interact_rate": "0.056977", "quality_score": "90.0", "share_cnt_all": "41369", "star_author_id": "7332756074233069578", "comment_cnt_all": "2821", "cover_image_uri": "tos-cn-p-0015/oEX4GyCgIiuSWnzALY1AJB5BJIJwN6afgA7ite", "v2_first_tag_id": "[607]", "item_create_time": "1783194554", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.421
cmrntrlb600107kys88pcoxgb	cmrntnuo1000e7kx8ty528vca	7659130274244234822	10	智斗开始#智斗	智斗开始#智斗	@古拉拉黑暗女王	{"likes": 580043, "shares": 195503, "comments": 5477}	{智斗}	https://p3.douyinpic.com/img/tos-cn-p-0015c000-ce/o0qK4QPQYHBWrFZfAg4NAcA1ws1f6pTDiec2fV~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7659130274244234822	2026-07-05 19:37:13	2026-07-16 18:10:51.424	{anime_recap}	0.85	ai	0.45	C	research_only	{"raw": {"id": "7659130274244234822", "user_info": {"name": "古拉拉黑暗女王", "follower": "11362", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_o8ESMBniaPgPABWvAWH1TAICKykAEhrlAxi5Q.jpeg?from=3782654143", "core_user_id": "1660679510558121"}, "object_type": 2, "attribute_datas": {"score": "1.5598", "vv_all": "7534408", "item_title": "智斗开始#智斗", "finish_rate": "0.141236", "core_user_id": "1660679510558121", "interact_cnt": "781023", "is_star_item": "0", "like_cnt_all": "580043", "interact_rate": "0.103661", "quality_score": "96.666667", "share_cnt_all": "195503", "comment_cnt_all": "5477", "cover_image_uri": "tos-cn-p-0015c000-ce/o0qK4QPQYHBWrFZfAg4NAcA1ws1f6pTDiec2fV", "v2_first_tag_id": "[607]", "item_create_time": "1783280233", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.426
cmrm7j6b8000q7k4g4r9rxnu2	cmrm7j3js000c7k40877h1gk0	7660436203355156986	7	“姥姥 我在你心里排第一”#MVP #姥姥的外孙 #催泪 #亲情	“姥姥 我在你心里排第一”#MVP #姥姥的外孙 #催泪 #亲情	@恕奉	{"likes": 244899, "shares": 36131, "comments": 1177}	{MVP,姥姥的外孙,催泪,亲情}	\N	https://www.douyin.com/video/7660436203355156986	2026-07-09 08:04:52	2026-07-15 16:00:04.293	{movie_recap}	0.85	ai	0.384	B	research_only	{"raw": {"id": "7660436203355156986", "user_info": {"name": "恕奉", "star_id": "7610415423720915007", "follower": "126109", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_c8a72d250ef2d7c1e2005aad63f64b7b.jpeg?from=3782654143", "core_user_id": "7532692762274825275"}, "object_type": 2, "attribute_datas": {"score": "1.4754", "vv_all": "3492599", "item_title": "“姥姥 我在你心里排第一”#MVP #姥姥的外孙 #催泪 #亲情", "finish_rate": "0.094957", "core_user_id": "7532692762274825275", "interact_cnt": "282207", "is_star_item": "0", "like_cnt_all": "244899", "interact_rate": "0.080801", "quality_score": "86.666667", "share_cnt_all": "36131", "star_author_id": "7610415423720915007", "comment_cnt_all": "1177", "cover_image_uri": "tos-cn-p-0015c000-ce/osV54iUAiIhEw1Jt6PfrwJRAeKhP1Bn5EA3iBt", "v2_first_tag_id": "[604]", "item_create_time": "1783584292", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:41.012
cmrm7j69y000e7k4gueqkpgz9	cmrm7j3js000c7k40877h1gk0	7651984682527631281	1	“愿得一人心 白首不相离” #治愈 #治愈短片 #爱情	“愿得一人心 白首不相离” #治愈 #治愈短片 #爱情	@郑沅沅	{"likes": 725904, "shares": 105099, "comments": 7993}	{治愈,治愈短片,爱情}	\N	https://www.douyin.com/video/7651984682527631281	2026-06-16 13:28:39	2026-07-15 16:00:04.235	{movie_recap,anime_recap}	0.75	ai	0.613	S	research_only	{"raw": {"id": "7651984682527631281", "user_info": {"name": "郑沅沅", "star_id": "7655898460884828186", "follower": "19766", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=3782654143", "core_user_id": "2292904398167159"}, "object_type": 2, "attribute_datas": {"score": "1.5598", "vv_all": "9463837", "item_title": "“愿得一人心 白首不相离” #治愈 #治愈短片 #爱情", "finish_rate": "0.125853", "core_user_id": "2292904398167159", "interact_cnt": "838996", "is_star_item": "0", "like_cnt_all": "725904", "interact_rate": "0.088653", "quality_score": "96.666667", "share_cnt_all": "105099", "star_author_id": "7655898460884828186", "comment_cnt_all": "7993", "cover_image_uri": "tos-cn-p-0015c000-ce/ocYiRQgYeAI1e45wFG7UWwCenIJ8LBiPxpHQ4l", "v2_first_tag_id": "[604]", "item_create_time": "1781616519", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:40.966
cmrntrl8p000i7kysuu6792hq	cmrntnuo1000e7kx8ty528vca	7658870546754489654	1	七月新番:鬼的新娘，迟来的依靠 #动漫推荐 #二次元	七月新番:鬼的新娘，迟来的依靠 #动漫推荐 #二次元	@平时动漫	{"likes": 1565325, "shares": 153335, "comments": 23257}	{动漫推荐,二次元}	https://p3.douyinpic.com/img/tos-cn-p-0015/oIhuIGEDWffBbmOCxU4JBIIIilFgn7AkRfCj3A~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7658870546754489654	2026-07-05 02:49:26	2026-07-16 18:10:51.335	{anime_recap}	0.95	ai	0.717	S	research_only	{"raw": {"id": "7658870546754489654", "user_info": {"name": "平时动漫", "star_id": "7384951878066372617", "follower": "2042577", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813_3effa6c5a6784cf098fb6c8c87abf7d6.jpeg?from=3782654143", "core_user_id": "95456456247"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "31868354", "item_title": "七月新番:鬼的新娘，迟来的依靠 #动漫推荐 #二次元", "finish_rate": "0.139624", "core_user_id": "95456456247", "interact_cnt": "1741917", "is_star_item": "0", "like_cnt_all": "1565325", "interact_rate": "0.05466", "quality_score": "100.0", "share_cnt_all": "153335", "star_author_id": "7384951878066372617", "comment_cnt_all": "23257", "cover_image_uri": "tos-cn-p-0015/oIhuIGEDWffBbmOCxU4JBIIIilFgn7AkRfCj3A", "v2_first_tag_id": "[607]", "item_create_time": "1783219766", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.337
cmrntrl9r000k7kyslr53w947	cmrntnuo1000e7kx8ty528vca	7652355010994474278	2	那年装X界来了个天才！王从天降 愤怒狰狞 我即是核弹！ #暗影大人 #动漫杂谈 #动漫编年史 #我在抖音看动漫 #充能计划	那年装X界来了个天才！王从天降 愤怒狰狞 我即是核弹！ #暗影大人 #动漫杂谈 #动漫编年史 #我在抖音看动漫 #充能计划	@江川『动漫推荐』	{"likes": 1385681, "shares": 142643, "comments": 29538}	{暗影大人,动漫杂谈,动漫编年史,我在抖音看动漫,充能计划}	https://p3.douyinpic.com/img/tos-cn-p-0015/oE9BCAO7AjdQpCGqaqNFEALMQB7fZEFlegDQAM~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7652355010994474278	2026-06-17 13:25:53	2026-07-16 18:10:51.374	{anime_recap}	0.95	ai	0.621	A	research_only	{"raw": {"id": "7652355010994474278", "user_info": {"name": "江川『动漫推荐』", "star_id": "6800293594713292813", "follower": "944238", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_okcAJANhkg8jleMDhICI9XATAyEwfFAAzKDBEw.jpeg?from=3782654143", "core_user_id": "95915091410"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "19255181", "item_title": "那年装X界来了个天才！王从天降 愤怒狰狞 我即是核弹！ #暗影大人 #动漫杂谈 #动漫编年史 #我在抖音看动漫 #充能计划", "finish_rate": "0.091231", "core_user_id": "95915091410", "interact_cnt": "1557862", "is_star_item": "0", "like_cnt_all": "1385681", "interact_rate": "0.080906", "quality_score": "100.0", "share_cnt_all": "142643", "star_author_id": "6800293594713292813", "comment_cnt_all": "29538", "cover_image_uri": "tos-cn-p-0015/oE9BCAO7AjdQpCGqaqNFEALMQB7fZEFlegDQAM", "v2_first_tag_id": "[607]", "item_create_time": "1781702753", "v2_second_tag_id": "[60704]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.375
cmrm7j6bn000w7k4gmu3pi6tu	cmrm7j3js000c7k40877h1gk0	7661092787463418533	10	成了#影视解说#混剪	成了#影视解说#混剪	@Viral content	{"likes": 223268, "shares": 11841, "comments": 495}	{影视解说,混剪}	\N	https://www.douyin.com/video/7661092787463418533	2026-07-11 02:32:44	2026-07-15 16:00:04.329	{movie_recap}	0.95	ai	0.348	C	research_only	{"raw": {"id": "7661092787463418533", "user_info": {"name": "Viral content", "follower": "66613", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_da56c866f58fd2484440f77fc0096a2a.jpeg?from=3782654143", "core_user_id": "7636959821136970810"}, "object_type": 2, "attribute_datas": {"score": "1.4199", "vv_all": "3813080", "item_title": "成了#影视解说#混剪", "finish_rate": "0.316234", "core_user_id": "7636959821136970810", "interact_cnt": "235604", "is_star_item": "0", "like_cnt_all": "223268", "interact_rate": "0.061788", "quality_score": "80.0", "share_cnt_all": "11841", "comment_cnt_all": "495", "cover_image_uri": "tos-cn-p-0015c000-ce/oAeRsqt3EDHaAFShZDoI4wEqgm7UBvDzAI1f97", "v2_first_tag_id": "[604]", "item_create_time": "1783737164", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:41.027
cmrm7j6a9000g7k4gu0fbvfrq	cmrm7j3js000c7k40877h1gk0	7654143433938508475	2	“你总以为机会无限 所以不懂珍惜眼前”#MVP #催泪 #爱回家 #亲情	“你总以为机会无限 所以不懂珍惜眼前”#MVP #催泪 #爱回家 #亲情	@恕奉	{"likes": 370010, "shares": 77524, "comments": 4631}	{MVP,催泪,爱回家,亲情}	\N	https://www.douyin.com/video/7654143433938508475	2026-06-22 09:05:42	2026-07-15 16:00:04.258	{movie_recap}	0.85	ai	0.492	A	research_only	{"raw": {"id": "7654143433938508475", "user_info": {"name": "恕奉", "star_id": "7610415423720915007", "follower": "126109", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_c8a72d250ef2d7c1e2005aad63f64b7b.jpeg?from=3782654143", "core_user_id": "7532692762274825275"}, "object_type": 2, "attribute_datas": {"score": "1.5598", "vv_all": "6277940", "item_title": "“你总以为机会无限 所以不懂珍惜眼前”#MVP #催泪 #爱回家 #亲情", "finish_rate": "0.103274", "core_user_id": "7532692762274825275", "interact_cnt": "452165", "is_star_item": "0", "like_cnt_all": "370010", "interact_rate": "0.072024", "quality_score": "96.666667", "share_cnt_all": "77524", "star_author_id": "7610415423720915007", "comment_cnt_all": "4631", "cover_image_uri": "tos-cn-p-0015c000-ce/o4FpuSuqOAodEQhAEztPB9eBoVxfQGoVAWQwID", "v2_first_tag_id": "[604]", "item_create_time": "1782119142", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:40.977
cmrntrl9z000m7kys43r0l74u	cmrntnuo1000e7kx8ty528vca	7659301103053327625	3	爷孙俩被关到地心世界，开始了无尽的轮回！#动漫推荐 #二次元	爷孙俩被关到地心世界，开始了无尽的轮回！#动漫推荐 #二次元	@挚清	{"likes": 1243853, "shares": 237043, "comments": 7075}	{动漫推荐,二次元}	https://p3.douyinpic.com/img/tos-cn-p-0015/o0lvfADSmTdAbF9rqBNS0JNAgQHLBxbQten0Eb~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7659301103053327625	2026-07-06 06:40:11	2026-07-16 18:10:51.38	{anime_recap,regression}	0.85	ai	0.546	A	research_only	{"raw": {"id": "7659301103053327625", "user_info": {"name": "挚清", "star_id": "6924013942050127880", "follower": "1213609", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_oQIKmAP63CA65EQmFsFfACgmTe2AiGIF9AD0Au.jpeg?from=3782654143", "core_user_id": "3175031551563152"}, "object_type": 2, "attribute_datas": {"score": "1.5598", "vv_all": "34374321", "item_title": "爷孙俩被关到地心世界，开始了无尽的轮回！#动漫推荐 #二次元", "finish_rate": "0.083668", "core_user_id": "3175031551563152", "interact_cnt": "1487971", "is_star_item": "0", "like_cnt_all": "1243853", "interact_rate": "0.043287", "quality_score": "96.666667", "share_cnt_all": "237043", "star_author_id": "6924013942050127880", "comment_cnt_all": "7075", "cover_image_uri": "tos-cn-p-0015/o0lvfADSmTdAbF9rqBNS0JNAgQHLBxbQten0Eb", "v2_first_tag_id": "[607]", "item_create_time": "1783320011", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.383
cmrntrlad000q7kysr1r2ct7q	cmrntnuo1000e7kx8ty528vca	7656138217711783177	5	七月新番：《猫与龙》01集深度解说细节解析 #七月新番#动漫解说#动漫推荐#动漫#二次元	七月新番：《猫与龙》01集深度解说细节解析 #七月新番#动漫解说#动漫推荐#动漫#二次元	@团红动漫	{"likes": 920547, "shares": 142529, "comments": 9507}	{七月新番,动漫解说,动漫推荐,动漫,二次元}	https://p3.douyinpic.com/img/tos-cn-p-0015/okKFVABPID9D5CMHbfifAIBrqM8EFDE0QCEgAA~c5_300x400.jpeg?from=3213915784	https://www.douyin.com/video/7656138217711783177	2026-06-27 18:06:43	2026-07-16 18:10:51.395	{anime_recap}	0.95	ai	0.519	B	research_only	{"raw": {"id": "7656138217711783177", "user_info": {"name": "团红动漫", "star_id": "7274501459377389604", "follower": "1129665", "avatar_url": "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_4d8c7c23ae51f2b1156f66fba88f9ba4.jpeg?from=3782654143", "core_user_id": "4435849340271172"}, "object_type": 2, "attribute_datas": {"score": "1.5882", "vv_all": "14488897", "item_title": "七月新番：《猫与龙》01集深度解说细节解析 #七月新番#动漫解说#动漫推荐#动漫#二次元", "finish_rate": "0.054669", "core_user_id": "4435849340271172", "interact_cnt": "1072583", "is_star_item": "0", "like_cnt_all": "920547", "interact_rate": "0.074028", "quality_score": "100.0", "share_cnt_all": "142529", "star_author_id": "7274501459377389604", "comment_cnt_all": "9507", "cover_image_uri": "tos-cn-p-0015/okKFVABPID9D5CMHbfifAIBrqM8EFDE0QCEgAA", "v2_first_tag_id": "[607]", "item_create_time": "1782583603", "v2_second_tag_id": "[60703]"}}, "source": "justoneapi", "boardKey": "douyin:hot:anime_recap"}	2026-07-16 18:10:51.397
cmrm7j6af000i7k4gr00chfok	cmrm7j3js000c7k40877h1gk0	7652620248335701737	3	“愿得一人心，白首不分离！！！”#MVP#解说#正能量#纯爱	“愿得一人心，白首不分离！！！”#MVP#解说#正能量#纯爱	@木鸟	{"likes": 331621, "shares": 38224, "comments": 1459}	{MVP,解说,正能量,纯爱}	\N	https://www.douyin.com/video/7652620248335701737	2026-06-18 06:34:58	2026-07-15 16:00:04.263	{movie_recap,manhwa_recap,web_novel}	0.75	ai	0.441	B	research_only	{"raw": {"id": "7652620248335701737", "user_info": {"name": "木鸟", "star_id": "7478177550091419686", "follower": "39858", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c001_ooBEAQHEmCFIBfL7VUQAogAa6cAeeJooABaIUG.jpeg?from=3782654143", "core_user_id": "7475598242853880890"}, "object_type": 2, "attribute_datas": {"score": "1.4754", "vv_all": "6781972", "item_title": "“愿得一人心，白首不分离！！！”#MVP#解说#正能量#纯爱", "finish_rate": "0.123192", "core_user_id": "7475598242853880890", "interact_cnt": "371304", "is_star_item": "0", "like_cnt_all": "331621", "interact_rate": "0.054749", "quality_score": "86.666667", "share_cnt_all": "38224", "star_author_id": "7478177550091419686", "comment_cnt_all": "1459", "cover_image_uri": "tos-cn-p-0015/osqVDwnrOBCI5AF9wAgQHyPASMAEgffB3CIDEK", "v2_first_tag_id": "[604]", "item_create_time": "1781764498", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:40.983
cmrm7j6bi000u7k4g5et62prw	cmrm7j3js000c7k40877h1gk0	7653051915961404682	9	男孩意外捡到一颗蛋，竟是上古神兽 #我的观影报告 #好剧推荐	男孩意外捡到一颗蛋，竟是上古神兽 #我的观影报告 #好剧推荐	@小六影视	{"likes": 136527, "shares": 494, "comments": 99405}	{我的观影报告,好剧推荐}	\N	https://www.douyin.com/video/7653051915961404682	2026-06-19 10:30:12	2026-07-15 16:00:04.307	{movie_recap,fantasy}	0.85	ai	0.371	C	research_only	{"raw": {"id": "7653051915961404682", "user_info": {"name": "小六影视", "star_id": "7632668562486525998", "follower": "31997", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-avt-0015_7373b9f8a7e221df8f40b49257321de8.jpeg?from=3782654143", "core_user_id": "4213746617824024"}, "object_type": 2, "attribute_datas": {"score": "1.4199", "vv_all": "4490621", "item_title": "男孩意外捡到一颗蛋，竟是上古神兽 #我的观影报告 #好剧推荐", "finish_rate": "0.128917", "core_user_id": "4213746617824024", "interact_cnt": "236426", "is_star_item": "0", "like_cnt_all": "136527", "interact_rate": "0.052649", "quality_score": "80.0", "share_cnt_all": "494", "star_author_id": "7632668562486525998", "comment_cnt_all": "99405", "cover_image_uri": "tos-cn-p-0015/o0pIQXVyADGNGNc135F8gjIE9AfUBFIfAoBqaR", "v2_first_tag_id": "[604]", "item_create_time": "1781865012", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:41.022
cmrm7j6an000k7k4gs27aron5	cmrm7j3js000c7k40877h1gk0	7655584763096452371	4	它用一生赴一场约定，一等便是整整十年 原来忠诚从不用言语，日复一日的等待，就是最滚烫的爱意！#电影解说 #抖音精选 #了不起的精讲团 #影视经典补全计划	它用一生赴一场约定，一等便是整整十年 原来忠诚从不用言语，日复一日的等待，就是最滚烫的爱意！#电影解说 #抖音精选 #了不起的精讲团 #影视经典补全计划	@惊心说	{"likes": 254920, "shares": 102383, "comments": 2457}	{电影解说,抖音精选,了不起的精讲团,影视经典补全计划}	\N	https://www.douyin.com/video/7655584763096452371	2026-06-26 06:18:55	2026-07-15 16:00:04.27	{movie_recap}	0.95	ai	0.459	A	research_only	{"raw": {"id": "7655584763096452371", "user_info": {"name": "惊心说", "follower": "10324", "avatar_url": "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/douyin-user-image-file_d635b9bf6b03ef804d4641574386f176.jpeg?from=3782654143", "core_user_id": "7579299012788913189"}, "object_type": 2, "attribute_datas": {"score": "1.5315", "vv_all": "9241967", "item_title": "它用一生赴一场约定，一等便是整整十年 原来忠诚从不用言语，日复一日的等待，就是最滚烫的爱意！#电影解说 #抖音精选 #了不起的精讲团 #影视经典补全计划", "finish_rate": "0.016784", "core_user_id": "7579299012788913189", "interact_cnt": "359760", "is_star_item": "0", "like_cnt_all": "254920", "interact_rate": "0.038927", "quality_score": "93.333333", "share_cnt_all": "102383", "comment_cnt_all": "2457", "cover_image_uri": "tos-cn-p-0015/okE822DGfhCfewL1essk07sEEQxFQDozCQAAWR", "v2_first_tag_id": "[604]", "item_create_time": "1782454735", "v2_second_tag_id": "[60407]"}}, "source": "justoneapi", "boardKey": "douyin:hot:movie_recap"}	2026-07-15 15:00:40.991
\.


--
-- Data for Name: viral_remakes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.viral_remakes (id, project_id, viral_item_id, external_video_id, source_url, source_snapshot, genre, status, usage_policy, package_json, policy_checklist, policy_warnings, editor_notes, approved_by_user_id, approved_at, tokens_in, tokens_out, cost_usd, created_at, updated_at, script_mode, pipeline_phase, source_transcript, media_audio_key, media_expires_at, video_duration_sec, stt_cost_usd, source_transcript_translated) FROM stdin;
cmrm7z1k2000i7k40cyzw5f5y	cmrkxhf9900097kj8ranyxte2	cmrm7j69y000e7k4gueqkpgz9	7651984682527631281	https://www.douyin.com/video/7651984682527631281	{"stats": {"likes": 732729, "shares": 106077, "comments": 8046}, "title": "“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "caption": "“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "playUrl": "https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "videoId": "7651984682527631281", "coverUrl": "https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-resize-walign-adapt-aq:720:q75.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=3C3e1g69S2sAOGEi4BPvbNsFNOc%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "rawPayload": {"raw": {"city": "330300", "desc": "“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "rate": 12, "is_vr": false, "music": {"id": 7651984722647289000, "mid": "7651984722647288619", "album": "", "extra": "{\\"aed_music_score\\":0.03,\\"aed_singing_score\\":0.33,\\"aggregate_exempt_conf\\":[],\\"aigc_clip\\":false,\\"beats\\":{},\\"cover_colors\\":null,\\"douyin_beats_info\\":{},\\"dsp_switch\\":0,\\"extract_item_id\\":7651984682527631281,\\"has_edited\\":0,\\"hotsoon_review_time\\":-1,\\"is_aed_music\\":0,\\"is_red\\":0,\\"is_subsidy_exp\\":false,\\"long_pic_video_usable\\":true,\\"mini_luna\\":true,\\"music_label_id\\":null,\\"music_tagging\\":{\\"AEDs\\":null,\\"Genres\\":null,\\"Instruments\\":null,\\"Languages\\":null,\\"Moods\\":null,\\"SingingVersions\\":null,\\"Themes\\":null},\\"review_unshelve_reason\\":0,\\"reviewed\\":0,\\"schedule_search_time\\":0,\\"uniqa_speech_score\\":0.19,\\"with_aed_model\\":1}", "title": "@郑沅沅创作的原声", "author": "郑沅沅", "id_str": "7651984722647288619", "is_pgc": false, "status": 1, "artists": [], "sec_uid": "MS4wLjABAAAAiudDWtQee8IMJiQlwxH7BTR8j8V-YJa8O4EKvtv6sjNdvYK-30tjp0LY-o3p8bTA", "cover_hd": {"uri": "1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "duration": 414, "end_time": 0, "owner_id": "2292904398167159", "play_url": {"uri": "https://lf9-music-east.douyinstatic.com/obj/ies-music-hj/7651984754966793019.mp3", "width": 720, "height": 720, "url_key": "7651984722647288619", "url_list": ["https://lf9-music-east.douyinstatic.com/obj/ies-music-hj/7651984754966793019.mp3", "https://lf26-music-east.douyinstatic.com/obj/ies-music-hj/7651984754966793019.mp3"]}, "position": null, "redirect": false, "tag_list": null, "dsp_status": 10, "mute_share": false, "schema_url": "", "start_time": 0, "user_count": 0, "cover_large": {"uri": "1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "cover_thumb": {"uri": "168x168/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p3.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062", "https://p11.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062", "https://p26.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062"]}, "is_original": false, "reason_type": 0, "search_impr": {"entity_id": "7651984722647288619"}, "avatar_large": {"uri": "1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "avatar_thumb": {"uri": "100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p3.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p11.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "collect_stat": 0, "cover_medium": {"uri": "720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "is_del_video": false, "music_status": 1, "offline_desc": "", "owner_handle": "zyy61161145", "author_status": 1, "avatar_medium": {"uri": "720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "dmv_auto_show": false, "is_restricted": false, "author_deleted": false, "owner_nickname": "郑沅沅", "pgc_music_type": 2, "shoot_duration": 414, "video_duration": 414, "author_position": null, "source_platform": 23, "prevent_download": false, "preview_end_time": 0, "show_origin_clip": false, "artist_user_infos": null, "audition_duration": 414, "is_commerce_music": false, "is_original_sound": true, "is_video_self_see": false, "music_chart_ranks": null, "external_song_info": [], "preview_start_time": 0, "unshelve_countries": null, "binded_challenge_id": 0, "can_background_play": true, "is_matched_metadata": false, "music_collect_count": 0, "musician_user_infos": null, "lyric_short_position": null, "is_audio_url_with_cookie": false, "prevent_item_download_status": 0, "music_cover_atmosphere_color_value": ""}, "video": {"meta": "{\\"aed_info\\":\\"{\\\\\\"bgm_speech_ratio\\\\\\":0.411,\\\\\\"pure_bgm_ratio\\\\\\":0.562,\\\\\\"pure_noise_ratio\\\\\\":0.013,\\\\\\"speech_ratio\\\\\\":0.014,\\\\\\"total_bgm_ratio\\\\\\":0.973,\\\\\\"total_speech_ratio\\\\\\":0.425,\\\\\\"version\\\\\\":\\\\\\"v1\\\\\\"}\\",\\"bright_ratio_mean\\":\\"0.1139\\",\\"brightness\\":\\"98.22\\",\\"brightness_mean\\":\\"90.9305\\",\\"contrast\\":\\"88.92\\",\\"diff_overexposure_ratio\\":\\"0.0072\\",\\"format\\":\\"mp4\\",\\"gear_vqm\\":\\"{\\\\\\"1080p_720p\\\\\\":1,\\\\\\"720p_540p\\\\\\":-1}\\",\\"hrids\\":\\"260330234\\",\\"is_spatial_video\\":\\"0\\",\\"isad\\":\\"0\\",\\"item_info_video_tags_v2_level_1\\":\\"604\\",\\"item_info_video_tags_v2_level_2\\":\\"60407\\",\\"loudness\\":\\"-5.5\\",\\"overexposure_ratio_mean\\":\\"0.0157\\",\\"peak\\":\\"1\\",\\"qprf\\":\\"0.6772981882095337\\",\\"sdgs\\":\\"[\\\\\\"1080_1_1\\\\\\",\\\\\\"720_1_1\\\\\\",\\\\\\"720_2_1\\\\\\",\\\\\\"720_3_1\\\\\\",\\\\\\"720_4_1\\\\\\"]\\",\\"sr_potential\\":\\"{\\\\\\"v1.0\\\\\\":{\\\\\\"score\\\\\\":54.237}}\\",\\"sr_score\\":\\"0.000\\",\\"std_brightness\\":\\"30.9293\\",\\"strategy_tokens\\":\\"[\\\\\\"online\\\\\\",\\\\\\"reward01_0331\\\\\\",\\\\\\"reward02_0331\\\\\\"]\\",\\"title_info\\":\\"{\\\\\\"avg_br_pc\\\\\\":69,\\\\\\"bottom_res_add\\\\\\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\\\\\\"bullet_zone\\\\\\":0,\\\\\\"mean_br_l\\\\\\":[0,0,0,0,0.59,11.19],\\\\\\"pc60_br_l\\\\\\":[0,0,0,0,0.59,11.21],\\\\\\"progress_bar\\\\\\":[0,0,0],\\\\\\"ratio_br_l\\\\\\":[0,0,0,0,0.59,10.67],\\\\\\"ratio_br_l_thre220\\\\\\":[0,0,0,0,0,0],\\\\\\"ratio_edge_l\\\\\\":[0,0,0,0,0,0.07],\\\\\\"std_br_l\\\\\\":[0,0,0,0,0.03,2.37],\\\\\\"top_res_add\\\\\\":[0,0,0,0,0,0,0],\\\\\\"version\\\\\\":\\\\\\"v1.0\\\\\\"}\\",\\"video_speed\\":\\"[{\\\\\\"speed_down_score\\\\\\":0,\\\\\\"speed_up_score\\\\\\":0.4,\\\\\\"version\\\\\\":\\\\\\"v2\\\\\\"}]\\",\\"vqs_origin\\":\\"63.75\\"}", "tags": null, "audio": {}, "cover": {"uri": "tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB", "width": 720, "height": 541, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-resize-walign-adapt-aq:720:q75.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=3C3e1g69S2sAOGEi4BPvbNsFNOc%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-resize-walign-adapt-aq:720:q75.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=SKB9HlSs59sA%2BVkVaP8YYO%2FNEdY%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-resize-walign-adapt-aq:720:q75.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=K0JpNJ2xrK%2B1tO%2BvTTpJCA8dZlM%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-resize-walign-adapt-aq:720:q75.jpeg?lk3s=138a59ce&x-expires=1785337200&x-signature=91PSbPEKWJ8Ot6F%2Bn2umWNzUj80%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0"]}, "ratio": "540p", "width": 1440, "format": "mp4", "height": 1080, "is_h265": 0, "bit_rate": [{"FPS": 30, "format": "mp4", "HDR_bit": "", "is_h265": 1, "HDR_type": "", "bit_rate": 2374606, "gear_name": "1080_1_1", "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 1440, "height": 1080, "file_cs": "c:0-342586-9717", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_1080p_2374606", "url_list": ["https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-se-jltc-cold.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 123064005, "file_hash": "eeeb7e1b00792a7a2be5bfb429f12833"}, "is_bytevc1": 1, "video_extra": "{\\"PktOffsetMap\\":\\"[{\\\\\\"time\\\\\\": 1, \\\\\\"offset\\\\\\": 1094110}, {\\\\\\"time\\\\\\": 2, \\\\\\"offset\\\\\\": 1446256}, {\\\\\\"time\\\\\\": 3, \\\\\\"offset\\\\\\": 1633236}, {\\\\\\"time\\\\\\": 4, \\\\\\"offset\\\\\\": 1923555}, {\\\\\\"time\\\\\\": 5, \\\\\\"offset\\\\\\": 2277287}, {\\\\\\"time\\\\\\": 10, \\\\\\"offset\\\\\\": 3736314}]\\",\\"format\\":\\"mp4\\",\\"definition\\":\\"1080p\\",\\"quality\\":\\"normal\\",\\"file_id\\":\\"cd9b26a353854b69a714ac8389b567a2\\",\\"v_gear_id\\":\\"aweme/high_value_group\\",\\"u_vmaf\\":92.2162,\\"applog_map\\":{\\"feature_id\\":\\"ffeb5ba76acc1ce63619e1ddded468c9\\"},\\"mvmaf\\":\\"{\\\\\\"mvmaf_sr_v1080\\\\\\":97.482,\\\\\\"mvmaf_sr_v960\\\\\\":98.194,\\\\\\"mvmaf_sr_v864\\\\\\":98.703,\\\\\\"mvmaf_sr_v720\\\\\\":99.148,\\\\\\"mvmaf_ori_v1080\\\\\\":92.234,\\\\\\"mvmaf_ori_v960\\\\\\":93.59,\\\\\\"mvmaf_ori_v864\\\\\\":94.393,\\\\\\"mvmaf_ori_v720\\\\\\":95.453}\\",\\"volume_info\\":\\"{\\\\\\"Loudness\\\\\\":-10.9,\\\\\\"LoudnessRange\\\\\\":2.4,\\\\\\"LoudnessRangeEnd\\\\\\":-10,\\\\\\"LoudnessRangeStart\\\\\\":-12.5,\\\\\\"MaximumMomentaryLoudness\\\\\\":-7.8,\\\\\\"MaximumShortTermLoudness\\\\\\":-9.6,\\\\\\"Metrics\\\\\\":{\\\\\\"Loudness\\\\\\":{\\\\\\"Integrated\\\\\\":-10.849},\\\\\\"Phase\\\\\\":{\\\\\\"RMSDownmixDiff\\\\\\":-0.075},\\\\\\"RMSStats\\\\\\":{\\\\\\"LRDiff\\\\\\":0.004,\\\\\\"LTotal\\\\\\":-13.737,\\\\\\"Peak\\\\\\":-2.456,\\\\\\"RTotal\\\\\\":-13.741},\\\\\\"Version\\\\\\":\\\\\\"1.4.2\\\\\\"},\\\\\\"Peak\\\\\\":0.74989,\\\\\\"Version\\\\\\":2}\\",\\"ufq\\":\\"{\\\\\\"enh\\\\\\":77.376,\\\\\\"playback\\\\\\":{\\\\\\"ori\\\\\\":73.61,\\\\\\"srv1\\\\\\":78.858},\\\\\\"src\\\\\\":77.466,\\\\\\"trans\\\\\\":73.61,\\\\\\"version\\\\\\":\\\\\\"v2.1\\\\\\"}\\",\\"audio_metrics\\":null,\\"audio_score\\":null}", "quality_type": 3}, {"FPS": 30, "format": "mp4", "HDR_bit": "", "is_h265": 1, "HDR_type": "", "bit_rate": 1519643, "gear_name": "720_1_1", "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 960, "height": 720, "file_cs": "c:0-342587-d8df", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_720p_1519643", "url_list": ["https://v95-hzyy-thr-daily-colda.douyinvod.com/0dc9044922fef23fae9fceaa18a99b40/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/ow0RDFK5EIPN0PmPcMaiAxBXJhiVhLjsCGiAP/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1484&bt=1484&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=Z2dpOjU2aWY0OWU6ZWUzZ0Bpam5yOHM5cjVuOzMzbGkzNEBiXjVeYi0xNjAxLWIuYy9jYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=103S_100b_104i_103Q_103R&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v95-zj-colda.douyinvod.com/0dc9044922fef23fae9fceaa18a99b40/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/ow0RDFK5EIPN0PmPcMaiAxBXJhiVhLjsCGiAP/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1484&bt=1484&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=Z2dpOjU2aWY0OWU6ZWUzZ0Bpam5yOHM5cjVuOzMzbGkzNEBiXjVeYi0xNjAxLWIuYy9jYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=fd20fb1be70b46319c4f03e2a78faded&sign=37ea050e47794a574d68f6e362dad737&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=fd20fb1be70b46319c4f03e2a78faded&sign=37ea050e47794a574d68f6e362dad737&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 78755523, "file_hash": "37ea050e47794a574d68f6e362dad737"}, "is_bytevc1": 1, "video_extra": "{\\"PktOffsetMap\\":\\"[{\\\\\\"time\\\\\\": 1, \\\\\\"offset\\\\\\": 863896}, {\\\\\\"time\\\\\\": 2, \\\\\\"offset\\\\\\": 1074142}, {\\\\\\"time\\\\\\": 3, \\\\\\"offset\\\\\\": 1194552}, {\\\\\\"time\\\\\\": 4, \\\\\\"offset\\\\\\": 1437018}, {\\\\\\"time\\\\\\": 5, \\\\\\"offset\\\\\\": 1685393}, {\\\\\\"time\\\\\\": 10, \\\\\\"offset\\\\\\": 2531761}]\\",\\"format\\":\\"mp4\\",\\"definition\\":\\"720p\\",\\"quality\\":\\"normal\\",\\"file_id\\":\\"fd20fb1be70b46319c4f03e2a78faded\\",\\"v_gear_id\\":\\"aweme/high_value_group\\",\\"u_vmaf\\":92.7131,\\"applog_map\\":{\\"feature_id\\":\\"7a4eee893fc3533131c574c97e1fd6f6\\"},\\"mvmaf\\":\\"{\\\\\\"mvmaf_sr_v1080\\\\\\":94.988,\\\\\\"mvmaf_sr_v960\\\\\\":96.048,\\\\\\"mvmaf_sr_v864\\\\\\":97.433,\\\\\\"mvmaf_sr_v720\\\\\\":97.625,\\\\\\"mvmaf_ori_v1080\\\\\\":86.15,\\\\\\"mvmaf_ori_v960\\\\\\":88.661,\\\\\\"mvmaf_ori_v864\\\\\\":90.288,\\\\\\"mvmaf_ori_v720\\\\\\":92.859}\\",\\"volume_info\\":\\"{\\\\\\"Loudness\\\\\\":-10.9,\\\\\\"LoudnessRange\\\\\\":2.4,\\\\\\"LoudnessRangeEnd\\\\\\":-10,\\\\\\"LoudnessRangeStart\\\\\\":-12.5,\\\\\\"MaximumMomentaryLoudness\\\\\\":-7.8,\\\\\\"MaximumShortTermLoudness\\\\\\":-9.6,\\\\\\"Metrics\\\\\\":{\\\\\\"Loudness\\\\\\":{\\\\\\"Integrated\\\\\\":-10.849},\\\\\\"Phase\\\\\\":{\\\\\\"RMSDownmixDiff\\\\\\":-0.075},\\\\\\"RMSStats\\\\\\":{\\\\\\"LRDiff\\\\\\":0.004,\\\\\\"LTotal\\\\\\":-13.737,\\\\\\"Peak\\\\\\":-2.456,\\\\\\"RTotal\\\\\\":-13.741},\\\\\\"Version\\\\\\":\\\\\\"1.4.2\\\\\\"},\\\\\\"Peak\\\\\\":0.74989,\\\\\\"Version\\\\\\":2}\\",\\"ufq\\":\\"{\\\\\\"enh\\\\\\":77.376,\\\\\\"playback\\\\\\":{\\\\\\"ori\\\\\\":67.526,\\\\\\"srv1\\\\\\":75.008},\\\\\\"src\\\\\\":77.466,\\\\\\"trans\\\\\\":67.526,\\\\\\"version\\\\\\":\\\\\\"v2.1\\\\\\"}\\",\\"audio_metrics\\":null,\\"audio_score\\":null}", "quality_type": 11}, {"FPS": 30, "format": "mp4", "HDR_bit": "", "is_h265": 1, "HDR_type": "", "bit_rate": 1019494, "gear_name": "720_2_1", "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 960, "height": 720, "file_cs": "c:0-342587-3b80", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_720p_1019494", "url_list": ["https://v95-se-zjwztc-cold.douyinvod.com/cfb6b9f83f5255f83f1d0b76b44aaf0f/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/osFXPhUhxMKyPbCiYPwBcQAPiaQ0Aj5REDIVm/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=995&bt=995&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NWU2NTk5OTtnO2Q6Mzc1M0Bpam5yOHM5cjVuOzMzbGkzNEBeNS4uYTNfXmMxLy8vM2BgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-se-gddgtc-cold.douyinvod.com/cfb6b9f83f5255f83f1d0b76b44aaf0f/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/osFXPhUhxMKyPbCiYPwBcQAPiaQ0Aj5REDIVm/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=995&bt=995&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NWU2NTk5OTtnO2Q6Mzc1M0Bpam5yOHM5cjVuOzMzbGkzNEBeNS4uYTNfXmMxLy8vM2BgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=c0c26420272a48fda8b666d612138ba2&sign=20c04f41f7ccd65d4bf56d95b86c4b3b&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=c0c26420272a48fda8b666d612138ba2&sign=20c04f41f7ccd65d4bf56d95b86c4b3b&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 52835306, "file_hash": "20c04f41f7ccd65d4bf56d95b86c4b3b"}, "is_bytevc1": 1, "video_extra": "{\\"PktOffsetMap\\":\\"[{\\\\\\"time\\\\\\": 1, \\\\\\"offset\\\\\\": 728222}, {\\\\\\"time\\\\\\": 2, \\\\\\"offset\\\\\\": 871586}, {\\\\\\"time\\\\\\": 3, \\\\\\"offset\\\\\\": 953011}, {\\\\\\"time\\\\\\": 4, \\\\\\"offset\\\\\\": 1113628}, {\\\\\\"time\\\\\\": 5, \\\\\\"offset\\\\\\": 1252559}, {\\\\\\"time\\\\\\": 10, \\\\\\"offset\\\\\\": 1825904}]\\",\\"format\\":\\"mp4\\",\\"definition\\":\\"720p\\",\\"quality\\":\\"normal\\",\\"file_id\\":\\"c0c26420272a48fda8b666d612138ba2\\",\\"v_gear_id\\":\\"aweme/high_value_group\\",\\"u_vmaf\\":88.875,\\"applog_map\\":{\\"feature_id\\":\\"7a4eee893fc3533131c574c97e1fd6f6\\"},\\"mvmaf\\":\\"{\\\\\\"mvmaf_sr_v1080\\\\\\":90.548,\\\\\\"mvmaf_sr_v960\\\\\\":91.938,\\\\\\"mvmaf_sr_v864\\\\\\":93.505,\\\\\\"mvmaf_sr_v720\\\\\\":94.331,\\\\\\"mvmaf_ori_v1080\\\\\\":81.097,\\\\\\"mvmaf_ori_v960\\\\\\":83.958,\\\\\\"mvmaf_ori_v864\\\\\\":85.94,\\\\\\"mvmaf_ori_v720\\\\\\":89.083}\\",\\"volume_info\\":\\"{\\\\\\"Loudness\\\\\\":-10.9,\\\\\\"LoudnessRange\\\\\\":2.4,\\\\\\"LoudnessRangeEnd\\\\\\":-10,\\\\\\"LoudnessRangeStart\\\\\\":-12.5,\\\\\\"MaximumMomentaryLoudness\\\\\\":-7.8,\\\\\\"MaximumShortTermLoudness\\\\\\":-9.6,\\\\\\"Metrics\\\\\\":{\\\\\\"Loudness\\\\\\":{\\\\\\"Integrated\\\\\\":-10.849},\\\\\\"Phase\\\\\\":{\\\\\\"RMSDownmixDiff\\\\\\":-0.075},\\\\\\"RMSStats\\\\\\":{\\\\\\"LRDiff\\\\\\":0.004,\\\\\\"LTotal\\\\\\":-13.737,\\\\\\"Peak\\\\\\":-2.456,\\\\\\"RTotal\\\\\\":-13.741},\\\\\\"Version\\\\\\":\\\\\\"1.4.2\\\\\\"},\\\\\\"Peak\\\\\\":0.74989,\\\\\\"Version\\\\\\":2}\\",\\"ufq\\":\\"{\\\\\\"enh\\\\\\":77.376,\\\\\\"playback\\\\\\":{\\\\\\"ori\\\\\\":63.449,\\\\\\"srv1\\\\\\":71.2},\\\\\\"src\\\\\\":77.466,\\\\\\"trans\\\\\\":63.449,\\\\\\"version\\\\\\":\\\\\\"v2.1\\\\\\"}\\",\\"audio_metrics\\":null,\\"audio_score\\":null}", "quality_type": 12}, {"FPS": 30, "format": "mp4", "HDR_bit": "", "is_h265": 1, "HDR_type": "", "bit_rate": 707708, "gear_name": "720_3_1", "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 960, "height": 720, "file_cs": "c:0-342587-8782", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_720p_707708", "url_list": ["https://v95-se-zjwztc-cold.douyinvod.com/106a594e93b394bdda1d97dd8892519c/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/ooQJe4UIxWQGVCYhgR8vpeIpLBA7khYl5ePxFQ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=691&bt=691&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=OzU2ZTk5NDdlO2ZnZTg4N0Bpam5yOHM5cjVuOzMzbGkzNEA0LWFjNTFfNV4xXi4yYzNgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0010e000b0009&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v26-cold.douyinvod.com/3606d080c126824e90151766b24b07c8/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/ooQJe4UIxWQGVCYhgR8vpeIpLBA7khYl5ePxFQ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=691&bt=691&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=OzU2ZTk5NDdlO2ZnZTg4N0Bpam5yOHM5cjVuOzMzbGkzNEA0LWFjNTFfNV4xXi4yYzNgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0010e000b0009&cdn_type=2&cquery=103R_103S_100b_104i_103Q&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=c465f55b1dac48ab84b14686fbd30278&sign=e7fc656494a10eec2692be0f2287d498&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=c465f55b1dac48ab84b14686fbd30278&sign=e7fc656494a10eec2692be0f2287d498&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 36677015, "file_hash": "e7fc656494a10eec2692be0f2287d498"}, "is_bytevc1": 1, "video_extra": "{\\"PktOffsetMap\\":\\"[{\\\\\\"time\\\\\\": 1, \\\\\\"offset\\\\\\": 626470}, {\\\\\\"time\\\\\\": 2, \\\\\\"offset\\\\\\": 719901}, {\\\\\\"time\\\\\\": 3, \\\\\\"offset\\\\\\": 776709}, {\\\\\\"time\\\\\\": 4, \\\\\\"offset\\\\\\": 871657}, {\\\\\\"time\\\\\\": 5, \\\\\\"offset\\\\\\": 971757}, {\\\\\\"time\\\\\\": 10, \\\\\\"offset\\\\\\": 1360113}]\\",\\"format\\":\\"mp4\\",\\"definition\\":\\"720p\\",\\"quality\\":\\"normal\\",\\"file_id\\":\\"c465f55b1dac48ab84b14686fbd30278\\",\\"v_gear_id\\":\\"aweme/high_value_group\\",\\"u_vmaf\\":84.2712,\\"applog_map\\":{\\"feature_id\\":\\"7a4eee893fc3533131c574c97e1fd6f6\\"},\\"mvmaf\\":\\"{\\\\\\"mvmaf_sr_v1080\\\\\\":85.468,\\\\\\"mvmaf_sr_v960\\\\\\":86.954,\\\\\\"mvmaf_sr_v864\\\\\\":88.426,\\\\\\"mvmaf_sr_v720\\\\\\":90.163,\\\\\\"mvmaf_ori_v1080\\\\\\":75.702,\\\\\\"mvmaf_ori_v960\\\\\\":78.724,\\\\\\"mvmaf_ori_v864\\\\\\":80.915,\\\\\\"mvmaf_ori_v720\\\\\\":84.535}\\",\\"volume_info\\":\\"{\\\\\\"Loudness\\\\\\":-10.9,\\\\\\"LoudnessRange\\\\\\":2.4,\\\\\\"LoudnessRangeEnd\\\\\\":-10,\\\\\\"LoudnessRangeStart\\\\\\":-12.5,\\\\\\"MaximumMomentaryLoudness\\\\\\":-7.8,\\\\\\"MaximumShortTermLoudness\\\\\\":-9.6,\\\\\\"Metrics\\\\\\":{\\\\\\"Loudness\\\\\\":{\\\\\\"Integrated\\\\\\":-10.849},\\\\\\"Phase\\\\\\":{\\\\\\"RMSDownmixDiff\\\\\\":-0.075},\\\\\\"RMSStats\\\\\\":{\\\\\\"LRDiff\\\\\\":0.004,\\\\\\"LTotal\\\\\\":-13.737,\\\\\\"Peak\\\\\\":-2.456,\\\\\\"RTotal\\\\\\":-13.741},\\\\\\"Version\\\\\\":\\\\\\"1.4.2\\\\\\"},\\\\\\"Peak\\\\\\":0.74989,\\\\\\"Version\\\\\\":2}\\",\\"ufq\\":\\"{\\\\\\"enh\\\\\\":77.376,\\\\\\"playback\\\\\\":{\\\\\\"ori\\\\\\":59.402,\\\\\\"srv1\\\\\\":67.285},\\\\\\"src\\\\\\":77.466,\\\\\\"trans\\\\\\":59.402,\\\\\\"version\\\\\\":\\\\\\"v2.1\\\\\\"}\\",\\"audio_metrics\\":null,\\"audio_score\\":null}", "quality_type": 13}, {"FPS": 30, "format": "mp4", "HDR_bit": "", "is_h265": 1, "HDR_type": "", "bit_rate": 425190, "gear_name": "720_4_1", "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 960, "height": 720, "file_cs": "c:0-342587-cdea", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_720p_425190", "url_list": ["https://v95-zjjx2tc-cold.douyinvod.com/97206781bde9dd583670fb1c0c3e5813/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/o4MPiAahBVAcPox5jmXmPQiEA0CPDc2IVF8gh/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=415&bt=415&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=aTc6OWVoNWdkOTU1Z2hmNUBpam5yOHM5cjVuOzMzbGkzNEBjMS8yLjVhXzIxYDYtYGNiYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-gzb-hl-tc-cn-coldy-a.douyinvod.com/97206781bde9dd583670fb1c0c3e5813/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/o4MPiAahBVAcPox5jmXmPQiEA0CPDc2IVF8gh/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=415&bt=415&cs=2&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=aTc6OWVoNWdkOTU1Z2hmNUBpam5yOHM5cjVuOzMzbGkzNEBjMS8yLjVhXzIxYDYtYGNiYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=7a4eee893fc3533131c574c97e1fd6f6&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=e2fcce0d92c2465abdd28e1b562744ff&sign=853dfcc70276c15384af7822a55cc643&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=e2fcce0d92c2465abdd28e1b562744ff&sign=853dfcc70276c15384af7822a55cc643&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 22035487, "file_hash": "853dfcc70276c15384af7822a55cc643"}, "is_bytevc1": 1, "video_extra": "{\\"PktOffsetMap\\":\\"[{\\\\\\"time\\\\\\": 1, \\\\\\"offset\\\\\\": 529480}, {\\\\\\"time\\\\\\": 2, \\\\\\"offset\\\\\\": 578178}, {\\\\\\"time\\\\\\": 3, \\\\\\"offset\\\\\\": 612591}, {\\\\\\"time\\\\\\": 4, \\\\\\"offset\\\\\\": 672471}, {\\\\\\"time\\\\\\": 5, \\\\\\"offset\\\\\\": 709444}, {\\\\\\"time\\\\\\": 10, \\\\\\"offset\\\\\\": 945953}]\\",\\"format\\":\\"mp4\\",\\"definition\\":\\"720p\\",\\"quality\\":\\"normal\\",\\"file_id\\":\\"e2fcce0d92c2465abdd28e1b562744ff\\",\\"v_gear_id\\":\\"aweme/high_value_group\\",\\"u_vmaf\\":75.7291,\\"applog_map\\":{\\"feature_id\\":\\"7a4eee893fc3533131c574c97e1fd6f6\\"},\\"mvmaf\\":\\"{\\\\\\"mvmaf_sr_v1080\\\\\\":76.082,\\\\\\"mvmaf_sr_v960\\\\\\":78.172,\\\\\\"mvmaf_sr_v864\\\\\\":79.785,\\\\\\"mvmaf_sr_v720\\\\\\":82.071,\\\\\\"mvmaf_ori_v1080\\\\\\":66.737,\\\\\\"mvmaf_ori_v960\\\\\\":69.832,\\\\\\"mvmaf_ori_v864\\\\\\":72.348,\\\\\\"mvmaf_ori_v720\\\\\\":76.449}\\",\\"volume_info\\":\\"{\\\\\\"Loudness\\\\\\":-10.9,\\\\\\"LoudnessRange\\\\\\":2.4,\\\\\\"LoudnessRangeEnd\\\\\\":-10,\\\\\\"LoudnessRangeStart\\\\\\":-12.5,\\\\\\"MaximumMomentaryLoudness\\\\\\":-7.8,\\\\\\"MaximumShortTermLoudness\\\\\\":-9.6,\\\\\\"Metrics\\\\\\":{\\\\\\"Loudness\\\\\\":{\\\\\\"Integrated\\\\\\":-10.849},\\\\\\"Phase\\\\\\":{\\\\\\"RMSDownmixDiff\\\\\\":-0.075},\\\\\\"RMSStats\\\\\\":{\\\\\\"LRDiff\\\\\\":0.004,\\\\\\"LTotal\\\\\\":-13.737,\\\\\\"Peak\\\\\\":-2.456,\\\\\\"RTotal\\\\\\":-13.741},\\\\\\"Version\\\\\\":\\\\\\"1.4.2\\\\\\"},\\\\\\"Peak\\\\\\":0.74989,\\\\\\"Version\\\\\\":2}\\",\\"ufq\\":\\"{\\\\\\"enh\\\\\\":77.376,\\\\\\"playback\\\\\\":{\\\\\\"ori\\\\\\":52.679,\\\\\\"srv1\\\\\\":60.384},\\\\\\"src\\\\\\":77.466,\\\\\\"trans\\\\\\":52.679,\\\\\\"version\\\\\\":\\\\\\"v2.1\\\\\\"}\\",\\"audio_metrics\\":null,\\"audio_score\\":null}", "quality_type": 14}], "duration": 414567, "play_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 1440, "height": 1080, "file_cs": "c:0-342586-9717", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_1080p_2374606", "url_list": ["https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-se-jltc-cold.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 123064005, "file_hash": "eeeb7e1b00792a7a2be5bfb429f12833"}, "big_thumbs": [{"uri": "tos-cn-p-0015c000-ce/oMM5wBc0xjVmDPhaKaIXTAiTFPhPIFC5PiNSA", "fext": "jpg", "uris": [], "img_num": 138, "img_url": "https://p3-sign.douyinpic.com/tos-cn-p-0015c000-ce/oMM5wBc0xjVmDPhaKaIXTAiTFPhPIFC5PiNSA~tplv-noop.heif?biz_tag=progress_thumb&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&l=2026071523130293A6741474E267387DD0&x-expires=1784132396&x-signature=kQL%2Fom18AUar2AJhGHPZ0qDDn4Q%3D", "duration": 414.53967, "img_urls": [], "interval": 3.003, "img_x_len": 10, "img_y_len": 14, "img_x_size": 182, "img_y_size": 136}], "is_bytevc1": 0, "is_callback": true, "video_model": "", "origin_cover": {"uri": "tos-cn-i-dy/_offtrans__720x540_dc131cb1d4ab5cdea705a6176cebb3f3_d32c8d23f3fbee7284a46d76dd06e8ee1c4c104459bf87afb179e8f4ee4601bf_vvic", "width": 480, "height": 360, "url_list": ["https://p95-bj-sign.douyinpic.com/tos-cn-i-dy/_offtrans__720x540_dc131cb1d4ab5cdea705a6176cebb3f3_d32c8d23f3fbee7284a46d76dd06e8ee1c4c104459bf87afb179e8f4ee4601bf_vvic~tplv-dy-aweme-images-offline.image?lk3s=138a59ce&x-expires=1785337200&x-signature=tT9x0lJ2iWoZgVBHT%2FXC6RHeik0%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-dy/_offtrans__720x540_dc131cb1d4ab5cdea705a6176cebb3f3_d32c8d23f3fbee7284a46d76dd06e8ee1c4c104459bf87afb179e8f4ee4601bf_vvic~tplv-dy-aweme-images-offline.image?lk3s=138a59ce&x-expires=1785337200&x-signature=I%2F8SBmjc0WFeGpPqiJC3rUwNq%2FQ%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/tos-cn-i-dy/_offtrans__720x540_dc131cb1d4ab5cdea705a6176cebb3f3_d32c8d23f3fbee7284a46d76dd06e8ee1c4c104459bf87afb179e8f4ee4601bf_vvic~tplv-dy-aweme-images-offline.image?lk3s=138a59ce&x-expires=1785337200&x-signature=ZQdyGld4jraxedF5iXdVZPizCiA%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/tos-cn-p-0015c000-ce/okzh0Ij5PkCcACiTiDjIcxVFMPAaBXPs5mIPE~tplv-dy-360p.jpeg?lk3s=138a59ce&x-expires=1785337200&x-signature=kCFNQcOROfLn32WUKRy2jEb62nU%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0"]}, "download_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 720, "height": 720, "file_cs": "c:0-448118-d55a", "url_list": ["https://v95-se-zjwztc-cold.douyinvod.com/79449767ea53fe269535be4e9f5e5bcb/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oMYi4UWxIOYpALcBPJ8gfgJnuRPYC8GlBRfe7Q/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2903&bt=2903&cs=0&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=PDo2NGg2ODM7ZWVlM2ZkM0Bpam5yOHM5cjVuOzMzbGkzNEAyNDI0MmNjNS0xMTI2LTQyYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=93c5283e1794c821af5e0ee1411bec9d&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v95-hzyy-thr-daily-colda.douyinvod.com/79449767ea53fe269535be4e9f5e5bcb/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oMYi4UWxIOYpALcBPJ8gfgJnuRPYC8GlBRfe7Q/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2903&bt=2903&cs=0&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=PDo2NGg2ODM7ZWVlM2ZkM0Bpam5yOHM5cjVuOzMzbGkzNEAyNDI0MmNjNS0xMTI2LTQyYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=93c5283e1794c821af5e0ee1411bec9d&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&ratio=540p&watermark=1&media_type=4&vr_type=0&improve_bitrate=0&biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA&logo_name=aweme_search_suffix&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&ratio=540p&watermark=1&media_type=4&vr_type=0&improve_bitrate=0&biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA&logo_name=aweme_search_suffix&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 155181386}, "dynamic_cover": {"uri": "tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB", "width": 720, "height": 720, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=g1TMesekPkUS4A3JUIjPcOzDZOo%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=waFYPUEUAb6ugH%2FOPiZJqaWVEXQ%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=iaNh5xnp7Cvahh3U3AzN7Os5F10%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0"]}, "has_watermark": true, "is_long_video": 1, "is_source_HDR": 0, "play_addr_265": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 1440, "height": 1080, "file_cs": "c:0-342586-9717", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_1080p_2374606", "url_list": ["https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-se-jltc-cold.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 123064005, "file_hash": "eeeb7e1b00792a7a2be5bfb429f12833"}, "animated_cover": {"uri": "tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB", "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=g1TMesekPkUS4A3JUIjPcOzDZOo%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=waFYPUEUAb6ugH%2FOPiZJqaWVEXQ%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/obj/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB?lk3s=138a59ce&x-expires=1785337200&x-signature=iaNh5xnp7Cvahh3U3AzN7Os5F10%3D&from=327834062_large&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=dynamic_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0"]}, "bit_rate_audio": null, "need_set_token": false, "play_addr_h264": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 768, "height": 576, "file_cs": "c:0-448118-d55a|a:v1e00fgi0000d8oku27og65pe5co7k7g", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_h264_540p_1949039", "url_list": ["https://v5-se-gddgtc-cold.douyinvod.com/096c5da34c1886d3cdc96fa8a96412b1/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUpYBp3xGIJfejl4APLj8N7RQCepUAJQI4gWBY/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1903&bt=1903&cs=0&ds=6&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=ZDk0ODg0ZWhoOzs8ZTo7PEBpam5yOHM5cjVuOzMzbGkzNEBhY18vL2FeNi0xYmMxY2MuYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=f0150a16a324336cda5d6dd0b69ed299&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v95-aw-cold.douyinvod.com/096c5da34c1886d3cdc96fa8a96412b1/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUpYBp3xGIJfejl4APLj8N7RQCepUAJQI4gWBY/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1903&bt=1903&cs=0&ds=6&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=ZDk0ODg0ZWhoOzs8ZTo7PEBpam5yOHM5cjVuOzMzbGkzNEBhY18vL2FeNi0xYmMxY2MuYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=f0150a16a324336cda5d6dd0b69ed299&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=19f8f74bf9e8480e9eabd12525b1f6da&sign=708dd8e7f926629b790149a87a0dd29a&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=19f8f74bf9e8480e9eabd12525b1f6da&sign=708dd8e7f926629b790149a87a0dd29a&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 101000940, "file_hash": "708dd8e7f926629b790149a87a0dd29a"}, "cdn_url_expired": 1784132396, "horizontal_type": 1, "play_addr_lowbr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 1440, "height": 1080, "file_cs": "c:0-342586-9717", "url_key": "v1e00fgi0000d8oku27og65pe5co7k7g_bytevc1_1080p_2374606", "url_list": ["https://v95-hzyy-thr-daily-colda.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=100b_104i_103Q_103R_103S&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v5-se-jltc-cold.douyinvod.com/3c758c033d2b29f7694c6205abb6aebf/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oUAXPxaBi5cimCAV1X0RFDhIXNPPMjiPXMENJ/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2318&bt=2318&cs=2&ds=4&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=NTo4PDZmNzo8ZTg2NjllZ0Bpam5yOHM5cjVuOzMzbGkzNEBeM181NV4uXjMxNTJeLzZgYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0050e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=ffeb5ba76acc1ce63619e1ddded468c9&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&file_id=cd9b26a353854b69a714ac8389b567a2&sign=eeeb7e1b00792a7a2be5bfb429f12833&is_play_url=1&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 123064005, "file_hash": "eeeb7e1b00792a7a2be5bfb429f12833"}, "use_static_cover": true, "misc_download_addrs": "{\\"suffix_scene\\":{\\"uri\\":\\"v1e00fgi0000d8oku27og65pe5co7k7g\\",\\"url_list\\":[\\"https://v5-se-bd-daily-cold.douyinvod.com/01e7591ec2352a93f38aaccc195ac07b/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oAA5IiVYDjMmA3BhPX2aKcPSySJF5CP0VEiPA/?a=1128\\\\u0026ch=26\\\\u0026cr=3\\\\u0026dr=0\\\\u0026lr=all\\\\u0026cd=0%7C0%7C0%7C3\\\\u0026cv=1\\\\u0026br=2938\\\\u0026bt=2938\\\\u0026cs=0\\\\u0026ds=3\\\\u0026ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25\\\\u0026mime_type=video_mp4\\\\u0026qs=0\\\\u0026rc=NGU7aDU1aWczNGYzaWY7OkBpam5yOHM5cjVuOzMzbGkzNEAvLWFeMTU2NmMxMzYzMDIuYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D\\\\u0026btag=c0090e000b0049\\\\u0026cdn_type=2\\\\u0026cquery=100b_104i_103Q_103R_103S\\\\u0026dy_q=1784128382\\\\u0026feature_id=93c5283e1794c821af5e0ee1411bec9d\\\\u0026l=2026071523130293A6741474E267387DD0\\\\u0026pwid=282\\\\u0026req_cdn_type=r\\",\\"https://v95-hzyy-thr-daily-colda.douyinvod.com/e33e54eef2540132500e8ab14a8fdd49/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oAA5IiVYDjMmA3BhPX2aKcPSySJF5CP0VEiPA/?a=1128\\\\u0026ch=26\\\\u0026cr=3\\\\u0026dr=0\\\\u0026lr=all\\\\u0026cd=0%7C0%7C0%7C3\\\\u0026cv=1\\\\u0026br=2938\\\\u0026bt=2938\\\\u0026cs=0\\\\u0026ds=3\\\\u0026ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25\\\\u0026mime_type=video_mp4\\\\u0026qs=0\\\\u0026rc=NGU7aDU1aWczNGYzaWY7OkBpam5yOHM5cjVuOzMzbGkzNEAvLWFeMTU2NmMxMzYzMDIuYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D\\\\u0026btag=c0090e000b0049\\\\u0026cdn_type=2\\\\u0026cquery=104i_103Q_103R_103S_100b\\\\u0026dy_q=1784128382\\\\u0026feature_id=93c5283e1794c821af5e0ee1411bec9d\\\\u0026l=2026071523130293A6741474E267387DD0\\\\u0026pwid=282\\\\u0026req_cdn_type=r\\",\\"https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g\\\\u0026line=0\\\\u0026ratio=540p\\\\u0026watermark=1\\\\u0026media_type=4\\\\u0026vr_type=0\\\\u0026improve_bitrate=0\\\\u0026biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA\\\\u0026logo_name=aweme_diversion_search\\\\u0026source=PackSourceEnum_AWEME_DETAIL\\",\\"https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g\\\\u0026line=1\\\\u0026ratio=540p\\\\u0026watermark=1\\\\u0026media_type=4\\\\u0026vr_type=0\\\\u0026improve_bitrate=0\\\\u0026biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA\\\\u0026logo_name=aweme_diversion_search\\\\u0026source=PackSourceEnum_AWEME_DETAIL\\"],\\"width\\":720,\\"height\\":720,\\"data_size\\":157071589,\\"file_cs\\":\\"c:0-448118-d55a\\"}}", "cover_original_scale": {"uri": "tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB", "width": 480, "height": 360, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-360p.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=digH5POpvYZ28cg5RixAdfUqKX0%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-360p.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=I%2FRp53N6tgtxaz%2BiWMo0u%2FsRX9A%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-360p.webp?lk3s=138a59ce&x-expires=1785337200&x-signature=ROEOP8NbzBdYNIWSuKSx9DrxKEk%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0", "https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-0813c000-ce/owQ7VxgFCD5fAfMsEg88WoA8A7Q8dAfvJpYUPB~tplv-dy-360p.jpeg?lk3s=138a59ce&x-expires=1785337200&x-signature=wWYlig%2FuxUAzCrCJrSKCZwj9eG0%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=origin_cover&biz_tag=aweme_video&l=2026071523130293A6741474E267387DD0"]}, "download_suffix_logo_addr": {"uri": "v1e00fgi0000d8oku27og65pe5co7k7g", "width": 720, "height": 720, "file_cs": "c:0-448118-d55a", "url_list": ["https://v95-se-zjwztc-cold.douyinvod.com/79449767ea53fe269535be4e9f5e5bcb/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oMYi4UWxIOYpALcBPJ8gfgJnuRPYC8GlBRfe7Q/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2903&bt=2903&cs=0&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=PDo2NGg2ODM7ZWVlM2ZkM0Bpam5yOHM5cjVuOzMzbGkzNEAyNDI0MmNjNS0xMTI2LTQyYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=104i_103Q_103R_103S_100b&dy_q=1784128382&feature_id=93c5283e1794c821af5e0ee1411bec9d&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://v95-hzyy-thr-daily-colda.douyinvod.com/79449767ea53fe269535be4e9f5e5bcb/6a57b32c/video/tos/cn/tos-cn-ve-15c000-ce/oMYi4UWxIOYpALcBPJ8gfgJnuRPYC8GlBRfe7Q/?a=1128&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2903&bt=2903&cs=0&ds=3&ft=hlcQBmppftrGLJ.CQ.C_Q8MmgI~nbcrhuecaGXq82wb5iLNwvyvvONNJ1uZk806C~25&mime_type=video_mp4&qs=0&rc=PDo2NGg2ODM7ZWVlM2ZkM0Bpam5yOHM5cjVuOzMzbGkzNEAyNDI0MmNjNS0xMTI2LTQyYSM0NGBiMmQ0cmxhLS1kLWJzcw%3D%3D&btag=c0090e000b0049&cdn_type=2&cquery=103Q_103R_103S_100b_104i&dy_q=1784128382&feature_id=93c5283e1794c821af5e0ee1411bec9d&l=2026071523130293A6741474E267387DD0&pwid=282&req_cdn_type=r", "https://api-play.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=0&ratio=540p&watermark=1&media_type=4&vr_type=0&improve_bitrate=0&biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA&logo_name=aweme_search_suffix&source=PackSourceEnum_AWEME_DETAIL", "https://api.amemv.com/aweme/v1/play/?video_id=v1e00fgi0000d8oku27og65pe5co7k7g&line=1&ratio=540p&watermark=1&media_type=4&vr_type=0&improve_bitrate=0&biz_sign=NRPI1lC4AlkgB1YZ_o3IkPAfESQSvePEcuabqdUhJiqwTcZpGZwEk8VA-ePT9VaaOzLa7CA0Ou-V1V2BgVcWfNQb7kfHDGbNHaUZIZuaRMUGyO7s5wbVW7et0I2xs1hA&logo_name=aweme_search_suffix&source=PackSourceEnum_AWEME_DETAIL"], "data_size": 155181386}, "has_download_suffix_logo_addr": true}, "author": {"uid": "2292904398167159", "is_cf": 0, "gender": 1, "ins_id": "", "region": "CN", "secret": 0, "status": 1, "cf_list": null, "is_star": false, "room_id": 0, "sec_uid": "MS4wLjABAAAAiudDWtQee8IMJiQlwxH7BTR8j8V-YJa8O4EKvtv6sjNdvYK-30tjp0LY-o3p8bTA", "birthday": "", "cha_list": null, "cv_level": "", "is_block": false, "language": "zh-Hans", "location": "", "nickname": "郑沅沅", "short_id": "94704024190", "user_age": 18, "cover_url": [{"uri": "c8510002be9a3a61aad2", "width": 720, "height": 720, "url_list": ["https://p26-sign.douyinpic.com/obj/c8510002be9a3a61aad2?lk3s=138a59ce&x-expires=1785337200&x-signature=vrOp%2ButFpPgB43asoPUwuBvS068%3D&from=327834062", "https://p95-zjwztc-sign.douyinpic.com/obj/c8510002be9a3a61aad2?lk3s=138a59ce&x-expires=1785337200&x-signature=ke%2BBWB4%2B%2BWwIIVBojkMGUgUBk1M%3D&from=327834062", "https://p95-bj-sign.douyinpic.com/obj/c8510002be9a3a61aad2?lk3s=138a59ce&x-expires=1785337200&x-signature=PTWsrNW0fSjlw85nFyDPZ3yWTog%3D&from=327834062"]}], "has_email": false, "item_list": null, "school_id": "", "signature": "一位做解说视频的小萌新☺️\\n没有架子！私信可以全部回😆\\n感谢老哥@南宫千雪 指导推荐", "story_ttl": 7, "unique_id": "zyy61161145", "user_mode": 0, "user_rate": 1, "user_tags": null, "weibo_url": "", "avatar_uri": "aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "bind_phone": "", "geofencing": [], "has_orders": false, "is_ad_fake": false, "share_info": {"share_url": "", "share_desc": "", "share_title": "", "share_desc_info": "", "share_qrcode_url": {"uri": "", "width": 720, "height": 720, "url_list": []}, "share_weibo_desc": "", "share_title_other": "", "share_title_myself": ""}, "story_open": false, "text_extra": null, "twitter_id": "", "type_label": null, "video_icon": {"uri": "", "width": 720, "height": 720, "url_list": []}, "weibo_name": "", "aweme_count": 11, "create_time": 0, "hide_search": false, "im_role_ids": null, "is_mix_user": true, "is_not_show": false, "is_verified": true, "live_status": 0, "live_verify": 0, "need_points": null, "school_name": "", "school_type": 0, "search_impr": {"entity_id": "2292904398167159"}, "story_count": 0, "user_period": 0, "verify_info": "", "ad_cover_url": null, "avatar_thumb": {"uri": "100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p26.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p11.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p3.douyinpic.com/aweme/100x100/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "card_entries": null, "display_info": null, "duet_setting": 0, "has_insights": false, "special_lock": 1, "twitter_name": "", "user_not_see": 0, "weibo_schema": "", "weibo_verify": "", "apple_account": 0, "avatar_larger": {"uri": "1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p3.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p11.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/1080x1080/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "avatar_medium": {"uri": "720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062", "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb.jpeg?from=327834062"]}, "aweme_control": {"can_share": true, "can_comment": true, "can_forward": true, "can_show_comment": true}, "constellation": 6, "contrail_list": null, "custom_verify": "", "follow_status": 0, "hide_location": false, "interest_tags": null, "is_blocked_v2": false, "live_commerce": false, "react_setting": 0, "school_poi_id": "", "user_canceled": false, "user_not_show": 1, "account_region": "", "avatar_168x168": {"uri": "168x168/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p26.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062", "https://p3.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062", "https://p11.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_168x168.jpeg?from=327834062"]}, "avatar_300x300": {"uri": "300x300/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb", "width": 720, "height": 720, "url_list": ["https://p3.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_300x300.jpeg?from=327834062", "https://p26.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_300x300.jpeg?from=327834062", "https://p11.douyinpic.com/img/aweme-avatar/tos-cn-i-0813c000-ce_ooPtUhavzoxyPMpAW0AqbMIADiAAiBaiIEmAb~c5_300x300.jpeg?from=327834062"]}, "fb_expire_time": 0, "follower_count": 0, "google_account": "", "is_blocking_v2": false, "link_item_list": null, "live_agreement": 0, "need_recommend": 0, "relative_users": null, "stitch_setting": 0, "tw_expire_time": 0, "with_dou_entry": false, "comment_setting": 0, "contacts_status": 1, "data_label_list": null, "follower_status": 0, "following_count": 0, "is_binded_weibo": false, "is_phone_binded": false, "ky_only_predict": 0, "live_high_value": 0, "neiguang_shield": 0, "new_story_cover": null, "reflow_page_gid": 0, "reflow_page_uid": 0, "school_category": 0, "signature_extra": null, "story25_comment": 1, "sync_to_toutiao": 0, "total_favorited": 2130477, "white_cover_url": null, "with_shop_entry": false, "authority_status": 0, "download_setting": -1, "favoriting_count": 1594, "followers_detail": null, "has_unread_story": false, "is_gov_media_vip": false, "prevent_download": false, "risk_notice_text": "", "share_qrcode_uri": "", "user_permissions": null, "account_cert_info": "{}", "close_friend_type": 0, "has_twitter_token": false, "has_youtube_token": false, "offline_info_list": null, "personal_tag_list": null, "show_image_bubble": false, "story_interactive": 4, "verification_type": 1, "aweme_hotsoon_auth": 1, "ban_user_functions": [], "can_set_geofencing": null, "card_sort_priority": null, "download_prompt_ts": 0, "has_facebook_token": false, "max_follower_count": 0, "platform_sync_info": null, "shield_digg_notice": 0, "show_nearby_active": false, "youtube_channel_id": "", "awemehts_greet_info": "", "commerce_user_level": 0, "live_agreement_time": 0, "mate_add_permission": 0, "with_commerce_entry": false, "youtube_expire_time": 0, "is_discipline_member": false, "shield_follow_notice": 0, "accept_private_policy": false, "comment_filter_status": 0, "enable_nearby_visible": true, "endorsement_info_list": null, "homepage_bottom_toast": null, "shield_comment_notice": 0, "special_follow_status": 0, "special_people_labels": null, "unique_id_modify_time": 1784128382, "youtube_channel_title": "", "with_fusion_shop_entry": false, "follower_request_status": 0, "signature_display_lines": 5, "card_entries_not_display": null, "enterprise_verify_reason": "", "aweme_hotsoon_auth_relation": 1, "hide_self_recommend_interest": 0, "hide_others_recommend_interest": 0, "follower_list_secondary_information_struct": null}, "images": null, "is_ads": false, "is_top": 0, "region": "CN", "status": {"aweme_id": "7651984682527631281", "part_see": 0, "reviewed": 1, "self_see": false, "is_delete": false, "is_private": false, "with_goods": false, "allow_share": true, "in_reviewing": false, "allow_comment": true, "is_prohibited": false, "review_result": {"review_status": 0}, "private_status": 0, "aweme_edit_info": {"edit_status": 0, "button_toast": "", "button_status": 2, "has_modified_all": false}, "download_status": 0, "dont_share_status": 0, "video_hide_search": 0, "with_fusion_goods": false, "enable_soft_delete": 0, "listen_video_status": 2, "allow_friend_recommend": false, "not_allow_soft_del_reason": "ab", "allow_friend_recommend_guide": false, "allow_self_recommend_to_friend": true}, "anchors": null, "caption": "“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "cmt_swt": false, "poi_biz": {}, "vr_type": 0, "aweme_id": "7651984682527631281", "cha_list": [{"cid": "1767586234303502", "desc": "", "type": 2, "author": {"uid": "0", "gender": 0, "region": "", "status": 0, "cf_list": null, "sec_uid": "", "birthday": "", "cha_list": null, "is_block": false, "language": "", "nickname": "", "short_id": "0", "cover_url": [], "has_email": false, "item_list": null, "signature": "", "unique_id": "", "user_tags": null, "avatar_uri": "", "bind_phone": "", "text_extra": null, "type_label": null, "video_icon": {"uri": "", "width": 720, "height": 720, "url_list": []}, "create_time": 0, "im_role_ids": null, "need_points": null, "search_impr": {"entity_id": "0"}, "ad_cover_url": null, "avatar_thumb": {"uri": "", "width": 720, "height": 720, "url_list": []}, "card_entries": null, "display_info": null, "avatar_larger": {"uri": "", "width": 720, "height": 720, "url_list": []}, "avatar_medium": {"uri": "", "width": 720, "height": 720, "url_list": []}, "aweme_control": {}, "constellation": 0, "contrail_list": null, "follow_status": 0, "interest_tags": null, "avatar_168x168": {"uri": "", "width": 720, "height": 720, "url_list": []}, "avatar_300x300": {"uri": "", "width": 720, "height": 720, "url_list": []}, "link_item_list": null, "relative_users": null, "with_dou_entry": false, "data_label_list": null, "is_phone_binded": false, "new_story_cover": null, "signature_extra": null, "white_cover_url": null, "followers_detail": null, "user_permissions": null, "offline_info_list": null, "personal_tag_list": null, "show_image_bubble": false, "ban_user_functions": null, "can_set_geofencing": null, "card_sort_priority": null, "platform_sync_info": null, "endorsement_info_list": null, "homepage_bottom_toast": null, "special_people_labels": null, "unique_id_modify_time": 0, "card_entries_not_display": null, "follower_list_secondary_information_struct": null}, "schema": "aweme://aweme/challenge/detail?cid=1767586234303502", "cha_name": "治愈", "sub_type": 0, "cha_attrs": null, "extra_attr": {"is_live": false}, "is_pgcshow": false, "share_info": {"share_url": "https://www.iesdouyin.com/share/challenge/1767586234303502/?u_code=-1&from_ssr=1", "share_desc": "在抖音，记录美好生活", "share_quote": "", "share_title": "我在抖音参与话题讨论#治愈 ", "bool_persist": 0, "share_desc_info": "我在抖音参与话题讨论#治愈 ", "share_weibo_desc": "我在抖音参与话题讨论#治愈 ", "share_title_other": "", "share_title_myself": "", "share_signature_url": "", "share_signature_desc": ""}, "show_items": null, "user_count": 0, "view_count": 0, "banner_list": null, "is_commerce": false, "search_impr": {"entity_id": "1767586234303502"}, "collect_stat": 0, "is_challenge": 1, "connect_music": [], "hashtag_profile": "douyin-admin-obj/5965faea162b6360d7b3f00460080e86"}], "distance": "", "duration": 414567, "group_id": "7119538793866153252", "is_story": 0, "original": 0, "position": null, "item_duet": 0, "misc_info": "{\\"activity_feed_json\\":\\"{\\\\\\"root_gid\\\\\\":\\\\\\"7268945196304338232\\\\\\"}\\",\\"common_business_mob\\":\\"{}\\",\\"has_native_text_template\\":0,\\"is_teen_video\\":0,\\"music_begin_time\\":\\"0\\",\\"original_gid_distance\\":1,\\"original_group_id\\":\\"7651276595357026171\\"}", "share_url": "https://www.iesdouyin.com/share/video/7651984682527631281/?region=CN&mid=7651984722647288619&u_code=-1&did=MS4wLjABAAAAsYjVlGTRkwurDMOXQJ8JvLYM6UVHvubarvbTOZ6Sn-Ej-yxwMTwlck2hi0FuHU5h&iid=MS4wLjABAAAANwkJuWIRFOzg5uCpDRpMj4OX-QryoDgn-yYlXQnRwQQ&with_sec_did=1&video_share_track_ver=&titleType=title&share_sign=OMC9ZSZI5.sUZXZnrIYExvrGWB4qAnrfsqt4skq.Vw0-&share_version=270000&ts=1784128382&from_aid=1128&from_ssr=1&share_track_info=%7B%22link_description_type%22%3A%22%22%7D", "shoot_way": "direct_shoot", "story_ttl": 0, "video_tag": [{"level": 1, "tag_id": 2019, "tag_name": "影视"}, {"level": 2, "tag_id": 2019002, "tag_name": "影视解说"}, {"level": 3, "tag_id": 2019002002, "tag_name": "电影解说"}], "aweme_type": 0, "geofencing": [], "image_list": null, "is_fantasy": false, "is_karaoke": false, "is_pgcshow": false, "is_preview": 0, "is_relieve": false, "item_react": 0, "item_share": 0, "item_title": "", "long_video": null, "media_type": 4, "promotions": [], "risk_infos": {"type": 0, "vote": false, "warn": false, "content": "", "risk_sink": false}, "share_info": {"share_url": "https://www.iesdouyin.com/share/video/7651984682527631281/?region=CN&mid=7651984722647288619&u_code=-1&did=MS4wLjABAAAAsYjVlGTRkwurDMOXQJ8JvLYM6UVHvubarvbTOZ6Sn-Ej-yxwMTwlck2hi0FuHU5h&iid=MS4wLjABAAAANwkJuWIRFOzg5uCpDRpMj4OX-QryoDgn-yYlXQnRwQQ&with_sec_did=1&video_share_track_ver=&titleType=title&share_sign=OMC9ZSZI5.sUZXZnrIYExvrGWB4qAnrfsqt4skq.Vw0-&share_version=270000&ts=1784128382&from_aid=1128&from_ssr=1&share_track_info=%7B%22link_description_type%22%3A%22%22%7D", "share_desc": "在抖音，记录美好生活", "share_quote": "", "share_title": "“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "bool_persist": 0, "share_desc_info": "#在抖音，记录美好生活#“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "share_link_desc": "1.71 复制打开抖音，看看【郑沅沅的作品】“愿得一人心 白首不相离” # 治愈 # 治愈短片... %s b@n.DU gOX:/ :4pm 09/02 ", "share_weibo_desc": "#在抖音，记录美好生活#“愿得一人心 白首不相离”\\n#治愈 #治愈短片 #爱情", "share_title_other": "", "share_title_myself": "", "share_signature_url": "", "share_signature_desc": ""}, "sort_label": "", "statistics": {"digest": "", "aweme_id": "7651984682527631281", "digg_count": 732729, "lose_count": 0, "play_count": 0, "share_count": 106077, "admire_count": 0, "collect_count": 64896, "comment_count": 8046, "forward_count": 0, "download_count": 15, "exposure_count": 0, "live_watch_count": 0, "lose_comment_count": 0, "whatsapp_share_count": 0}, "text_extra": [{"end": 17, "type": 1, "start": 14, "hashtag_id": "1767586234303502", "caption_end": 17, "is_commerce": false, "hashtag_name": "治愈", "caption_start": 14}, {"end": 23, "type": 1, "start": 18, "hashtag_id": "1608739826627592", "caption_end": 23, "is_commerce": false, "hashtag_name": "治愈短片", "caption_start": 18}, {"end": 27, "type": 1, "start": 24, "hashtag_id": "1562208367689745", "caption_end": 27, "is_commerce": false, "hashtag_name": "爱情", "caption_start": 24}], "video_text": [], "xigua_task": {"is_xigua_task": false}, "admire_auth": {"is_admire": 0, "admire_button": 0, "author_can_admire": 1, "is_show_admire_tab": 0, "is_show_admire_button": 0, "exit_admire_in_aweme_post": 0, "is_iron_fans_in_aweme_post": 0, "is_click_admire_icon_recently": 0, "is_fifty_admire_author_stable_fans": 0}, "comment_gid": 7651984682527631000, "create_time": 1781616519, "image_infos": null, "img_bitrate": null, "is_24_story": 0, "is_25_story": 0, "is_hash_tag": 1, "is_in_scope": false, "item_stitch": 0, "sec_item_id": "MS4wLjAAAAAASby_5gSqniIcoHSq4nbPchE_CdbTS3BLlJJ0Lo2aZjH0uSgcYUKBGo4VLSY1ls1e", "series_info": {"ids": null, "desc": "感人催泪电影解说", "extra": "{\\"ad_strategy\\":\\"{\\\\\\"32\\\\\\":1}\\",\\"content_sub_type\\":3,\\"create_source\\":0,\\"enter_from\\":\\"app\\",\\"first_reviewed\\":1,\\"free_product_info\\":{\\"product_id\\":7661997441440666650},\\"is_author_set_self_see\\":0,\\"is_author_set_self_see_playlet\\":0,\\"last_added_item_time\\":1783947949,\\"mix_ad_info\\":{\\"copy_right_item_count\\":9,\\"music_physical_game_count\\":0,\\"risk_copy_right_item_count\\":0},\\"new_mix_tag_name\\":\\"影视\\",\\"next_info\\":{\\"cover\\":\\"douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed\\",\\"desc\\":\\"感人催泪电影解说\\",\\"name\\":\\"治愈短片\\"},\\"playlet_control\\":[800,801,802,803,804],\\"segmentation\\":\\"治愈 短片\\",\\"top_item_content_label\\":{\\"2019\\":9},\\"total_duration\\":3378}", "stats": {"play_vv": 0, "collect_vv": 0, "total_episode": 9, "current_episode": 1, "updated_to_episode": 9, "last_added_item_time": 1783947949}, "is_iaa": 0, "status": {"status": 2, "status_desc": "更新至9集", "is_collected": 0}, "cover_url": {"uri": "douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed", "width": 720, "height": 720, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed~tplv-dy-resize-walign-adapt-aq:640:q80.heic?lk3s=138a59ce&x-expires=1784300400&x-signature=Va0p6n03TLsKUmXRnDovpkuvN70%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_cover&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed~tplv-dy-resize-walign-adapt-aq:640:q80.heic?lk3s=138a59ce&x-expires=1784300400&x-signature=0fQeWi4snRANHUUWbaPMsz0kqbg%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_cover&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed~tplv-dy-resize-walign-adapt-aq:640:q80.heic?lk3s=138a59ce&x-expires=1784300400&x-signature=a2RlU%2FMNUw9r5oymDufjK8Cxyjw%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_cover&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p5-ex-gddgtc-sign.douyinpic.com/douyin-user-image-file/1549c2ea848346ad0a2d8ff2402c52ed~tplv-dy-resize-walign-adapt-aq:640:q80.jpeg?lk3s=138a59ce&x-expires=1784300400&x-signature=UQ0BtCCF%2F%2FwhTAfaIIFFUzIXcGQ%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_cover&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0"]}, "directors": [], "real_name": "治愈短片", "series_id": "7661998101512128552", "share_info": {"share_url": "https://www.iesdouyin.com/share/playlet/detail/7661998101512128552/?schema_type=43&object_id=7661998101512128552&from_ssr=1", "share_desc": "2.07 :1pm 04/22 V@y.gO Euf:/ 我正在看【治愈短片】 长按复制此条消息，去抖音搜索，和我一起看短剧~", "share_title": "这么有趣的短剧，不能只有我一个人知道吧", "share_desc_info": "6.66 WzG:/ :7pm s@R.kp 02/21 我正在看【治愈短片】 长按复制此条消息，去抖音搜索，和我一起看短剧~", "share_weibo_desc": "6.66 WzG:/ :7pm s@R.kp 02/21 我正在看【治愈短片】 长按复制此条消息，去抖音搜索，和我一起看短剧~", "share_title_other": "", "share_title_myself": ""}, "create_time": 1783947949, "series_name": "短剧 · 治愈短片", "series_type": 10, "update_time": 1784070244, "is_exclusive": false, "watched_item": "", "dark_icon_url": {"uri": "tos-cn-i-30241dr4mi/f6bfed05d3354fbd86127c49c563a197", "width": 720, "height": 720, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/f6bfed05d3354fbd86127c49c563a197?lk3s=138a59ce&x-expires=1784149200&x-signature=x%2FHfNvM6Rc7HeHN3KXZ%2BKAI5sMo%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_icon_dark&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/f6bfed05d3354fbd86127c49c563a197?lk3s=138a59ce&x-expires=1784149200&x-signature=%2BfUrDnkP9inYhh5nPVQ7GBoY3kU%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_icon_dark&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/f6bfed05d3354fbd86127c49c563a197?lk3s=138a59ce&x-expires=1784149200&x-signature=uLJaPbyRIMYKzAdQB%2BDUqtcsOr8%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_icon_dark&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0"]}, "light_icon_url": {"uri": "tos-cn-i-30241dr4mi/7a9045c4c66541d6922c8aadf2094922", "width": 720, "height": 720, "url_list": ["https://p5-ex-gddgtc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/7a9045c4c66541d6922c8aadf2094922?lk3s=138a59ce&x-expires=1784149200&x-signature=MX8yQ8Z2ZetAPqletMND0v%2BIXSU%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_light_icon&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-zjwztc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/7a9045c4c66541d6922c8aadf2094922?lk3s=138a59ce&x-expires=1784149200&x-signature=e8QL4jB3HULmoo6HtFM%2B71vo5Ks%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_light_icon&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0", "https://p95-bj-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/7a9045c4c66541d6922c8aadf2094922?lk3s=138a59ce&x-expires=1784149200&x-signature=7oQSXm3f8%2BNdFKd3stpQWLz8SsY%3D&from=327834062&s=PackSourceEnum_AWEME_DETAIL&se=false&sc=series_light_icon&biz_tag=aweme_series&l=2026071523130293A6741474E267387DD0"]}, "recommend_color": null, "content_sub_type": 3, "is_charge_series": 0, "series_form_type": 0, "series_ui_config": {"collection_button": {"text": "收藏短剧"}, "series_bar_button_infos": [{"click_type": 2, "button_text": "下一集", "condition_material_types": [101]}, {"click_type": 0, "button_text": "观看完整正片", "condition_material_types": [102, 103, 104, 105, 106, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211]}], "general_position_tag_infos": [{"tag_position": 903, "general_tag_infos": [{"tag_id": 5001, "tag_style": {"corner_radius": 0, "colors_direction": 0}, "tag_priority": 10, "tag_custom_item_infos": [{"tag_icon": {"icon": {"uri": "tos-cn-i-30241dr4mi/92d97dd656934bd7a082c974e4e1ed51", "width": 720, "height": 720, "url_list": ["https://p95-zjwztc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/92d97dd656934bd7a082c974e4e1ed51?lk3s=138a59ce&x-expires=1784149200&x-signature=%2FoC3GeI0f56zD0mvJ9rj7xDGcpk%3D&from=327834062", "https://p5-ex-gddgtc-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/92d97dd656934bd7a082c974e4e1ed51?lk3s=138a59ce&x-expires=1784149200&x-signature=ZqSM9MrU2g3yuGBjwKAm4MkXoa0%3D&from=327834062", "https://p5-sign.douyinpic.com/obj/tos-cn-i-30241dr4mi/92d97dd656934bd7a082c974e4e1ed51?lk3s=138a59ce&x-expires=1784149200&x-signature=Lj%2FhySdB2qZfETX3m7u4Gmu9yOI%3D&from=327834062"]}, "width": 16, "height": 16, "css_style": "{\\"width\\":\\"16px\\",\\"height\\":\\"16px\\"}", "css_style_dark": "{\\"width\\":\\"16px\\",\\"height\\":\\"16px\\"}"}, "custom_style": 1}]}]}, {"tag_position": 905, "general_tag_infos": [{"tag_id": 1101, "tag_style": {"padding": [0, 1.5, 0, 1.5], "corner_radius": 0, "colors_direction": 0, "background_colors": []}, "tag_priority": 10, "tag_custom_item_infos": [{"tag_text": {"text": "9集全", "css_style": "{\\"font-family\\":\\"PingFang SC\\",\\"font-weight\\":\\"400\\",\\"font-style\\":\\"Regular\\",\\"font-size\\":\\"12px\\",\\"line-height\\":\\"17px\\",\\"color\\":\\"#16182399\\"}", "text_size": 12, "text_color": "{\\"color\\":\\"#FFFFFF\\",\\"alpha\\":\\"99\\"}", "css_style_dark": "{\\"font-family\\":\\"PingFang SC\\",\\"font-weight\\":\\"400\\",\\"font-style\\":\\"Regular\\",\\"font-size\\":\\"12px\\",\\"line-height\\":\\"17px\\",\\"color\\":\\"#FFFFFF99\\"}"}, "custom_style": 0}]}]}]}, "series_interactive": {"enable_config": false, "interactive_config": {"hide_desk_guide": true, "hide_intro_card": true, "hide_find_top_tab": true, "unlock_button_copy": "解锁全集", "hide_intro_card_tags": true, "collection_button_copy": "收藏合集", "hide_more_series_module": true, "more_series_module_copy": "更多合集", "display_detail_edit_button": true, "hide_recommendation_module": true, "hide_more_series_bottom_btn": true, "hide_intro_card_details_module": true, "recommendation_module_title_copy": "更多推荐"}}, "series_content_types": [{"name": "其他", "series_content_type": 124}], "enable_use_new_ent_data": false, "series_content_types_new": [], "entertainment_suggest_info": ""}, "user_digged": 0, "boost_status": 0, "chapter_list": null, "collect_stat": 0, "comment_list": null, "cover_labels": null, "has_vs_entry": false, "hybrid_label": null, "is_duet_sing": false, "is_life_item": false, "is_subtitled": 0, "is_use_music": false, "nearby_level": 0, "packed_clips": null, "video_labels": null, "aweme_control": {"can_share": true, "can_comment": true, "can_forward": true, "can_show_comment": true}, "cf_recheck_ts": 0, "commerce_info": {"is_ad": false, "ad_type": 0}, "desc_language": "zh", "ent_log_extra": {"log_extra": "{\\"global_log_extra\\":null,\\"page_log_extra\\":null,\\"aweme_log_extra\\":{\\"ce_current_group_id\\":\\"7651984682527631281\\",\\"author_id\\":\\"2292904398167159\\",\\"ce_content_id\\":\\"7661998101512128552\\",\\"ce_content_type\\":\\"playlet\\",\\"ce_content_subtype\\":\\"3\\",\\"ce_item_pany_status\\":\\"success\\",\\"ce_item_succ_type\\":\\"free\\",\\"ce_content_pany_type\\":\\"free\\",\\"ce_item_pany_type\\":\\"free\\",\\"is_ce_paid_and_iaa\\":\\"0\\"},\\"extra_log_extra\\":null}"}, "game_tag_info": {"is_game": false}, "image_comment": {"comment_highlight_text": ""}, "is_aigc_media": false, "is_image_beat": false, "is_share_post": false, "need_vs_entry": true, "preview_title": "“愿得一人心 白首不相离”", "report_action": false, "suggest_words": {"suggest_words": [{"scene": "comment_top_rec", "words": [{"info": "{\\"End\\":0,\\"Start\\":0,\\"ecpm_boost_tag\\":false,\\"log_pb\\":\\"\\",\\"qrec_for_search\\":\\"{}\\"}", "word": "莫娣的画", "word_id": "6649517971225974024"}], "icon_url": "", "hint_text": "大家都在搜：", "extra_info": "{\\"resp_from\\":\\"hit_cache\\"}"}, {"scene": "detail_inbox_rex", "words": [{"info": "{\\"End\\":0,\\"Start\\":0,\\"ecpm_boost_tag\\":false,\\"log_pb\\":\\"\\",\\"qrec_for_search\\":\\"{}\\"}", "word": "莫娣", "word_id": "6595798179894007044"}], "icon_url": "", "hint_text": "", "extra_info": "{\\"resp_from\\":\\"hit_cache\\"}"}]}, "video_control": {"duet_info": {"level": 2, "fail_info": {"code": 100013, "reason": "video_tag"}}, "allow_duet": false, "share_type": 1, "timer_info": {}, "allow_music": true, "allow_react": false, "allow_share": true, "allow_record": true, "allow_stitch": false, "share_grayed": false, "timer_status": 1, "allow_douplus": true, "download_info": {"level": 1, "fail_info": {"msg": "作品含AI生成内容暂不可下载", "code": 200142, "reason": "aigc_forbidden"}}, "allow_download": true, "show_ai_corner": true, "show_watermark": true, "show_progress_bar": 1, "draft_progress_bar": 1, "disable_record_reason": "", "prevent_download_type": 1, "duet_ignore_visibility": true, "allow_dynamic_wallpaper": false, "share_ignore_visibility": true, "download_ignore_visibility": true}, "author_user_id": 2292904398167159, "cf_assets_type": 0, "guide_btn_type": 0, "have_dashboard": false, "is_first_video": false, "label_top_text": null, "poi_patch_info": {"extra": "", "item_patch_poi_prompt_mark": 0}, "author_mask_tag": 0, "aweme_type_tags": "", "bodydance_score": 0, "common_bar_info": "[{\\"id\\":\\"related_search_anchor\\",\\"view_type\\":3,\\"business_type\\":1,\\"schema\\":\\"\\",\\"separator_dot\\":{\\"show\\":1},\\"main_content\\":{\\"text\\":\\"相关搜索\\"},\\"tail_icon\\":{\\"url\\":\\"\\",\\"show\\":1,\\"icon_url\\":{\\"uri\\":\\"tos-cn-i-3a9ajr9h4x/ic_s_s_arrowright_outlined_12.png\\",\\"url_list\\":[\\"https://p95-zjwztc-sign.douyinpic.com/tos-cn-i-3a9ajr9h4x/ic_s_s_arrowright_outlined_12.png~noop.png?lk3s=138a59ce\\\\u0026x-expires=1785337200\\\\u0026x-signature=0Y9n7FHk9iSl7mYfggCP1qXIqMk%3D\\\\u0026from=327834062\\",\\"https://p5-ex-gddgtc-sign.douyinpic.com/tos-cn-i-3a9ajr9h4x/ic_s_s_arrowright_outlined_12.png~noop.png?lk3s=138a59ce\\\\u0026x-expires=1785337200\\\\u0026x-signature=rnBxA%2F07yQydw93QKLS3OVrSUuw%3D\\\\u0026from=327834062\\",\\"https://p95-bj-sign.douyinpic.com/tos-cn-i-3a9ajr9h4x/ic_s_s_arrowright_outlined_12.png~noop.png?lk3s=138a59ce\\\\u0026x-expires=1785337200\\\\u0026x-signature=SHtmOSd71KAWCS6tlK84rvLtjns%3D\\\\u0026from=327834062\\",\\"https://p95-zjwztc-sign.douyinpic.com/tos-cn-i-3a9ajr9h4x/ic_s_s_arrowright_outlined_12.png~noop.jpeg?lk3s=138a59ce\\\\u0026x-expires=1785337200\\\\u0026x-signature=TbAxqyqlIFiFvDWHhAndkn%2FqGxU%3D\\\\u0026from=327834062\\"]}},\\"bar_container\\":{\\"height\\":40,\\"background_color\\":\\"#57292929\\"},\\"extra\\":\\"{\\\\\\"suggest_words\\\\\\":{\\\\\\"words\\\\\\":[{\\\\\\"word\\\\\\":\\\\\\"莫娣的画值多少钱\\\\\\",\\\\\\"word_id\\\\\\":\\\\\\"6781029600169317646\\\\\\",\\\\\\"info\\\\\\":\\\\\\"{\\\\\\\\\\\\\\"ecpm_boost_tag\\\\\\\\\\\\\\":false,\\\\\\\\\\\\\\"start_ts\\\\\\\\\\\\\\":1}\\\\\\",\\\\\\"schema\\\\\\":\\\\\\"aweme://search?boost_ecom_word=0\\\\\\\\u0026client_engine_extra={\\\\\\\\\\\\\\"boost_ecom_word\\\\\\\\\\\\\\":0,\\\\\\\\\\\\\\"qrec_for_search\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"{}\\\\\\\\\\\\\\"}\\\\\\\\u0026keyword=%E8%8E%AB%E5%A8%A3%E7%9A%84%E7%94%BB%E5%80%BC%E5%A4%9A%E5%B0%91%E9%92%B1\\\\\\\\u0026needBack2Origin=1\\\\\\\\u0026type=general\\\\\\"},{\\\\\\"word\\\\\\":\\\\\\"雷特真实原型\\\\\\",\\\\\\"word_id\\\\\\":\\\\\\"7569278185712997681\\\\\\",\\\\\\"info\\\\\\":\\\\\\"{\\\\\\\\\\\\\\"ecpm_boost_tag\\\\\\\\\\\\\\":false,\\\\\\\\\\\\\\"start_ts\\\\\\\\\\\\\\":2}\\\\\\",\\\\\\"schema\\\\\\":\\\\\\"aweme://search?boost_ecom_word=0\\\\\\\\u0026client_engine_extra={\\\\\\\\\\\\\\"boost_ecom_word\\\\\\\\\\\\\\":0,\\\\\\\\\\\\\\"qrec_for_search\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"{}\\\\\\\\\\\\\\"}\\\\\\\\u0026keyword=%E9%9B%B7%E7%89%B9%E7%9C%9F%E5%AE%9E%E5%8E%9F%E5%9E%8B\\\\\\\\u0026needBack2Origin=1\\\\\\\\u0026type=general\\\\\\"},{\\\\\\"word\\\\\\":\\\\\\"关节炎\\\\\\",\\\\\\"word_id\\\\\\":\\\\\\"6539100425281344781\\\\\\",\\\\\\"info\\\\\\":\\\\\\"{\\\\\\\\\\\\\\"ecpm_boost_tag\\\\\\\\\\\\\\":false,\\\\\\\\\\\\\\"start_ts\\\\\\\\\\\\\\":3}\\\\\\",\\\\\\"schema\\\\\\":\\\\\\"aweme://search?boost_ecom_word=0\\\\\\\\u0026client_engine_extra={\\\\\\\\\\\\\\"boost_ecom_word\\\\\\\\\\\\\\":0,\\\\\\\\\\\\\\"qrec_for_search\\\\\\\\\\\\\\":\\\\\\\\\\\\\\"{}\\\\\\\\\\\\\\"}\\\\\\\\u0026keyword=%E5%85%B3%E8%8A%82%E7%82%8E\\\\\\\\u0026needBack2Origin=1\\\\\\\\u0026type=general\\\\\\"}],\\\\\\"bar_type\\\\\\":1,\\\\\\"ui_info\\\\\\":{\\\\\\"text\\\\\\":[{\\\\\\"text\\\\\\":\\\\\\"相关搜索\\\\\\",\\\\\\"color\\\\\\":\\\\\\"#FFFFFFFF\\\\\\",\\\\\\"is_bold\\\\\\":1,\\\\\\"type\\\\\\":1}]},\\\\\\"extra_info\\\\\\":{\\\\\\"gold_priority_show\\\\\\":1,\\\\\\"multi_intention\\\\\\":5,\\\\\\"resp_from\\\\\\":\\\\\\"hit_cache\\\\\\"}}}\\",\\"tracer_info\\":\\"{\\\\\\"main_structure_req_path\\\\\\":\\\\\\"/aweme/v1/aweme/detail/\\\\\\"}\\",\\"name\\":\\"相关搜索\\",\\"desc\\":\\"\\",\\"show_strategy\\":{\\"display_identity_status\\":3},\\"priority\\":53500}]", "danmaku_control": {"activities": [{"id": 1224, "type": 1}], "danmaku_cnt": 776, "skip_danmaku": false, "enable_danmaku": true, "is_post_denied": false, "post_denied_reason": "", "last_danmaku_offset": 414488, "pass_through_params": "{\\"has_danmaku\\":1}", "smart_mode_decision": 0, "first_danmaku_offset": 0, "post_privilege_level": 0}, "distribute_type": 2, "horizontal_type": 1, "image_crop_ctrl": 0, "impression_data": {"group_id_list_a": [], "group_id_list_b": [], "group_id_list_c": [], "group_id_list_d": [], "similar_id_list_a": null, "similar_id_list_b": null}, "is_from_ad_auth": false, "is_moment_story": 0, "original_images": null, "relation_labels": null, "share_rec_extra": "", "social_tag_list": null, "uniqid_position": null, "xigua_base_info": {"status": 0, "item_id": 0, "star_altar_type": 0, "star_altar_order_id": 0}, "fall_card_struct": {"recommend_reason_v2": "[]"}, "flash_mob_trends": 0, "guide_scene_info": {}, "is_new_text_mode": 0, "main_arch_common": "{\\"has_transcribe\\":true}", "press_panel_info": "[{\\"interactive\\":[\\"2_story\\",\\"2_friend\\"]},{\\"feedback\\":[\\"rr_feedback\\",\\"dislike\\",\\"ignore\\",\\"block\\",\\"unfollow\\",\\"sever\\",\\"dislike_collect\\"]},{\\"control\\":[\\"speed\\",\\"auth\\",\\"delete\\",\\"save\\",\\"collect\\",\\"reward\\",\\"bg_play\\",\\"duet\\",\\"together\\"]}]", "prevent_download": false, "series_paid_info": {"item_price": 0, "series_paid_status": 0}, "series_play_info": {"item_title_prefix": {"text": "第1集"}, "series_aweme_index": 1, "outflow_continue_play_info": {"next_item_episode": 2}}, "component_control": {"data_source_url": "/aweme/v1/aweme/detail/"}, "component_info_v2": "{\\"desc_lines_limit\\":0,\\"hide_marquee\\":false}", "create_scale_type": ["f_w"], "distribute_circle": {"is_campus": false, "distribute_type": 0, "campus_block_interaction": false}, "douplus_user_type": 0, "is_moment_history": 0, "nickname_position": null, "origin_text_extra": [], "series_basic_info": {"series_id": "7661998101512128552", "series_author_id": "2292904398167159"}, "without_watermark": false, "can_cache_to_local": true, "challenge_position": null, "diversion_bar_info": [], "geofencing_regions": null, "libfinsert_task_id": "", "origin_comment_ids": null, "product_genre_info": {"special_info": {"recommend_group_name": 0}, "product_genre_type": 2, "material_genre_sub_type_set": [4]}, "show_follow_button": {}, "trends_event_track": "{}", "visual_search_info": {"is_ecom_img": false, "is_high_recall_ecom": false, "is_show_img_entrance": false, "is_high_accuracy_ecom": false}, "activity_video_type": -1, "aweme_listen_struct": {"trace_info": "{\\"copyright_not_speech\\":\\"false\\",\\"copyright_reason\\":\\"has_listen_cp_new\\",\\"copyright_tag_hit\\":\\"\\",\\"copyright_use_aed_default\\":\\"false\\",\\"copyright_use_tag_default\\":\\"false\\",\\"cp_ab\\":\\"true\\",\\"desc\\":\\"\\",\\"duration_over\\":\\"true\\",\\"hit_high_risk\\":\\"false\\",\\"media_type\\":\\"4\\",\\"reason\\":\\"hit_ab_0\\",\\"show\\":\\"false\\"}"}, "feed_comment_config": {"common_flags": "{\\"api_ab\\":\\"0\\",\\"hashtag\\":\\"[{\\\\\\"name\\\\\\":\\\\\\"治愈\\\\\\",\\\\\\"id\\\\\\":1767586234303502},{\\\\\\"name\\\\\\":\\\\\\"治愈短片\\\\\\",\\\\\\"id\\\\\\":1608739826627592},{\\\\\\"name\\\\\\":\\\\\\"爱情\\\\\\",\\\\\\"id\\\\\\":1562208367689745}]\\",\\"item_author_nickname\\":\\"郑沅沅\\",\\"video_labels_v2_tag1\\":\\"电影\\",\\"video_labels_v2_tag2\\":\\"电影剧情解说\\",\\"video_type\\":\\"all\\"}", "image_challenge": {"inner_publish_text": "我也发一张"}, "input_config_text": "有什么想法，展开说说", "author_audit_status": 0, "double_publish_limit": 1, "input_config_text_type": "default_guide", "audio_comment_permission": 1, "common_comment_permission": 0}, "incentive_item_type": 0, "authentication_token": "MS4wLjAAAAAA-Waorn64Vlc056xJcfPTLABeQYkppTNjrPExrz0v4UOfUtYSzp7k_DzAMsC1h5GMswQB-9MnOTMQvY6BqXTV3B6Iif0hFvEHMDNEXgWeVXOI6_ToDaWP4OLha7U-H9UECw9pczhBnl8a0cBiReQP7IFG6RdbjVDAnPpe-0p0Vp7p60BJ9Zaa6zHrqiopWnx630FjL0OKLCbFOzhSXMlcOkiJvQbgnAGrlSPheu512mFsK1L1hsC_FqatKOW5Rw6I", "commerce_config_data": null, "disable_relation_bar": 0, "interaction_stickers": null, "is_collects_selected": 0, "preview_video_status": 1, "series_material_info": {"material_type": 101}, "friend_recommend_info": {"friend_recommend_source": 26, "disable_friend_recommend_guide_label": false}, "item_aigc_follow_shot": 1, "item_comment_settings": 0, "photo_search_entrance": {"ecom_type": 0}, "should_open_ad_report": false, "user_recommend_status": 1, "collection_corner_mark": 0, "dislike_dimension_list": null, "douyin_p_c_video_extra": "{\\"ai_summary_v2\\":1,\\"video_highlight_bar\\":1}", "enable_decorated_emoji": true, "follow_shoot_clip_info": {"clip_from_user": 7651984722647289000, "clip_video_all": 7651984722647289000}, "image_album_music_info": {"volume": 0, "end_time": 0, "begin_time": 0}, "item_warn_notification": {"show": false, "type": 0, "content": ""}, "mark_largely_following": false, "with_promotional_music": false, "comment_permission_info": {"can_comment": true, "press_entry": true, "toast_guide": false, "item_detail_entry": true, "comment_permission_status": 0}, "comment_words_recommend": {}, "publish_plus_alienation": {"alienation_type": 0}, "video_share_edit_status": 0, "entertainment_video_type": 1, "origin_duet_resource_uri": "", "dislike_dimension_list_v2": [{"icon": "https://p3.douyinpic.com/aweme-server-static-resource/dislike_objective.png~tplv-obj.image", "text": "我不想看", "entitys": [{"en_name": "author", "pre_text": "作者", "sub_text": "郑沅沅", "dimension_id": 1, "server_extra": "{\\"author_id\\":2292904398167159}"}, {"en_name": "music", "pre_text": "音乐", "sub_text": "@郑沅沅创作的原声", "dimension_id": 2, "server_extra": "{\\"music_id\\":7651984722647288619}"}, {"en_name": "hashtag", "pre_text": "话题", "sub_text": "治愈", "dimension_id": 4, "server_extra": "{\\"challenge_id\\":1767586234303502}"}, {"en_name": "hashtag", "pre_text": "话题", "sub_text": "治愈短片", "dimension_id": 4, "server_extra": "{\\"challenge_id\\":1608739826627592}"}, {"en_name": "hashtag", "pre_text": "话题", "sub_text": "爱情", "dimension_id": 4, "server_extra": "{\\"challenge_id\\":1562208367689745}"}]}, {"icon": "https://p3.douyinpic.com/aweme-server-static-resource/dislike_subjective.png~tplv-obj.image", "text": "反馈内容问题", "entitys": [{"en_name": "repeat", "pre_text": "相似过多", "dimension_id": 12, "server_extra": "{\\"subjective_id\\":1001}"}, {"en_name": "ad", "pre_text": "广告营销", "dimension_id": 12, "server_extra": "{\\"subjective_id\\":1002}"}, {"en_name": "disgust", "pre_text": "恶心恐怖", "dimension_id": 12, "server_extra": "{\\"subjective_id\\":1003}"}, {"en_name": "porn", "pre_text": "色情低俗", "dimension_id": 12, "server_extra": "{\\"subjective_id\\":1004}"}, {"en_name": "fake", "pre_text": "虚假夸张", "dimension_id": 12, "server_extra": "{\\"subjective_id\\":1005}"}]}], "douyin_pc_video_extra_seo": "", "enable_comment_sticker_rec": false, "entertainment_product_info": {"market_info": {"limit_free": {"in_free": false}}}, "duet_aggregate_in_music_tab": false, "luna_video_candidate_status": "{\\"listen_video\\":true}", "ecom_comment_atmosphere_type": 0, "entertainment_recommend_info": "{\\"recommend_free_count\\":0,\\"test_info\\":\\"\\",\\"recommend_playlet_trigger_reqid\\":\\"\\",\\"recommend_playlet_trigger_cid\\":\\"\\",\\"recommend_playlet_trigger_reqid_type\\":\\"\\",\\"playlet_continue_play_config\\":null,\\"roi3_mode\\":0,\\"predict_identity\\":\\"\\",\\"queue_mountain\\":0}", "entertainment_video_paid_way": {"paid_type": 0, "paid_ways": [], "enable_use_new_ent_data": true}, "pack_usage_scene_by_req_path": "/aweme/v1/aweme/detail/", "video_game_data_channel_config": {}, "personal_page_botton_diagnose_style": 0}, "source": "justoneapi"}, "publishedAt": "2026-06-16T13:28:39.000Z", "authorHandle": "@zyy61161145", "canonicalUrl": "https://www.iesdouyin.com/share/video/7651984682527631281/?region=CN&mid=7651984722647288619&u_code=-1&did=MS4wLjABAAAAsYjVlGTRkwurDMOXQJ8JvLYM6UVHvubarvbTOZ6Sn-Ej-yxwMTwlck2hi0FuHU5h&iid=MS4wLjABAAAANwkJuWIRFOzg5uCpDRpMj4OX-QryoDgn-yYlXQnRwQQ&with_sec_did=1&video_share_track_ver=&titleType=title&share_sign=OMC9ZSZI5.sUZXZnrIYExvrGWB4qAnrfsqt4skq.Vw0-&share_version=270000&ts=1784128382&from_aid=1128&from_ssr=1&share_track_info=%7B%22link_description_type%22%3A%22%22%7D"}	movie_recap	ready	remix_draft	\N	{"hookIsNew": false, "leadApproved": false, "hasStudioBrand": false, "noFullReupload": false, "scriptRewritten": false, "voiceWillBeRerecorded": false}	{}	\N	\N	\N	\N	\N	\N	2026-07-15 15:13:01.343	2026-07-15 16:08:23.158	full	ready	{"model": "whisper-1", "version": 1, "fullText": "女人患有严重的关节炎 在旁人眼里她就是个奇形怪物 哥哥因为经商失败 偷偷把母亲留给她的房子拿去了底盖 无处可去的她只能借住在姨妈家里 可时间一久 姨妈开始厌恶莫迪 她常常话里话外地催着莫迪离开 把她关在门外 莫迪再也忍受不了这种寄人篱下的屈辱 她来到贩卖店 准备在这里找份工作 这时一名渔夫走进店里 她要给自己招聘一个女佣人 等渔夫走后 她当机立断撕下墙上的招聘单 不步几公里来参加应聘 渔夫雷特从小在孤儿院长大 性格孤僻的她三十好几了 还没有一个像样的家 面对搜罗安小的莫迪 她张嘴就是嘲讽 我找到一个女人了 哇 我真是太幸运了 不管莫迪怎么捧吹自己 雷特还是毫不犹豫地拒绝了她 我还要回家 如果那女人再骂我一遍 谁骂谁 孩子们 他们不想听 他们不想听 我不在乎 有些人不喜欢 看她可怜 雷特把她送出了村子 两人分别后 雷特忍不住回头看了一眼 她不知道的是 在接下来的几个月 她会被这个一拳一拐的女人所折服 因为雷特在村里的名声很臭 在莫迪走后 基本没人过来应聘 雷特没有办法 无奈地她只能给莫迪一次机会 找到工作的莫迪很是激动 她赶紧跑回屋里收拾行李 准备迎接自己崭新的生活 即使面对姨妈的威胁 她也毫不犹豫地坐上了雷特的皮卡车 因为这是她出生以来第一次 做主自己的人生 但这里的工作 并不是她想象的那么轻松 不仅要伺候脾气暴躁的雇主 还要承担所有家务 刚来这里的莫迪 对屋子里的一切都充满了好奇 可这去被刚回家的雷特看好 她以为莫迪是在翻找自己的东西 莫迪连忙放下手里的东西 说自己做好了晚饭 雷特一看竟是自己最讨厌的萝卜汤 暴躁的脾气再也压制不住 她一边大吼着 一边摔着莫迪的东西 她需要的是一个可以照顾她的人 而不是等着她去照顾的残疾人 就这样莫迪被赶出了家门 可第二天一早 雷特就被一阵吵杂声吵醒 她疑惑的来到楼下 原来是莫迪正清理着地上的泥土 她并没有带着委屈离开这里 因为她已经没有地方可以去了 雷特见着没有说话 而是拿着莫迪做好的早餐出了门 这也算是一种默许吧 在这之后 雷特每天欲说而做日如而夕 莫迪就在家宰鸡做饭打理家务 虽然莫迪呆头呆脑 但她有着异于常人的绘画天赋 看着尘封已久的油漆 她灵机一动 把它涂在了生锈的储物沟上 这样原本色彩单调的房间 瞬间别有一番风味 等雷特工作回来 再端上一碗做好的鸡汤 雷特很满意莫迪的表现 可她的家里只有一张床 两人只能挤在一起睡觉 这让平时拘谨的莫迪十分难受 她彻夜未眠 但即使是这样 她也不想再过被姨妈施舍的生活了 姨妈觉得他们孤男寡女共处一室 败坏了家里的名声 对她一阵羞辱 可莫迪只是微微一笑 因为她清楚地知道 即使面对村子里的闲言碎语 也好过寄人篱下天天被人唾弃的生活 可这里并没有她想象的那么美好 只要她稍微不听话 就会遭到雷特的蠱打 而她又不敢反抗 每当受到委屈的时候 她就会拿起画笔 给家里添加几分色彩 看见这满屋子的鲜花野草 雷特嘴上虽然骂骂咧咧说糟蹋了房子 但心里却喜欢得不得了 她那古怪暴躁的性格 也在无形中被这些花花草草治愈着 这天一个富家小姐找上门 女人声称雷特欠了她三条鱼 莫迪小心翼翼回应说会帮她转达 无意间女人看到了屋里的花 她很喜欢 临走时女人询问了莫迪的名字 就这样莫迪交下了她人生中第一个朋友 而珊德拉也会成为她一生的贵人 等雷特回来后 莫迪将珊德拉上门要账的事情告诉了她 显然雷特已经把这件事情忘了 为了防止这样的事情再次发生 莫迪就用自己做的小卡片帮她记账 就这样莫迪成了雷特的搭档 他们的分工明确 雷特在前面卖鱼 莫迪就跟在后面记账 珊德拉很喜欢莫迪记账的小卡片 甚至愿意花钱连同卡片一起买下 莫迪不敢擅自做主 让她询问雷特的意见 最终雷特以十块钱的巨资 将卡片卖给了珊德拉 临走时 珊德拉还特意交代莫迪 多做一些这样的卡片 莫迪欣然答应 在这之后 画画变成了莫迪生活中的一部分 她画满了整个房间 楼梯上 侧镜上 还做了许多小卡片 雷特甚至主动给莫迪买了颜料 他们的感情越来越好 渐渐的莫迪的插画 成了他们收入来源的一部分 甚至有人花重金 只为购买一张莫迪制作的卡片 一时间莫迪名声大起 珊德拉更是直言想请她 专门给自己画画 可可珊德拉的老家因为远在隐约 考虑到雷特的感受 莫迪拒绝了 接着她表示想买一幅大一点的画 雷特听闻在角落里拿出几幅 但莫迪却不想这样 她不想把自己没画完的画卖出去 看出莫迪有些为难 她又赶紧打嘘地说 我不是故意的 我只是为了帮助你 我只是开玩笑的 这不是我说的 虽然不知道莫迪为什么会有钱不赚 但她还是会偏向莫迪的选择 他们虽然是主仆的关系 但远处一看更像是一对恩爱的夫妻 看着莫迪在每一幅画加上自己的名字 雷特虽然嘴硬 但心里却十分感动 她每天都会叮嘱莫迪不要忘了做家务 但说完她就拿起扫打宝屋子扫得干干净净 这天莫迪无意间提到了结婚的事情 雷特嘴上说着不愿意娶一个瘸子 可转头她就领着莫迪去教堂办理了结婚证 她已经深深地爱上了莫迪 虽然没有一场像样的婚礼 但莫迪却很满足 因为她嫁给了一个自己喜欢且喜欢自己的人 婚后他们整天黏在一起 莫迪的话也越卖越火爆 被当地的副总统发掘 她专门派记者登门采访莫迪 还用摄影机记录了生活状况 后来他们的爱情故事被全国播出 一时间他们风光无限 家里围满了参观购买的富家人士 可在这样耀眼的光环下 雷特却越来越自卑 因为她觉得能有这样的成就全是莫迪画画的功劳 而自己只是个渔夫 她害怕莫迪会丢下自己去找更好的人 恰好这天她又遇到了莫迪的姨妈 这让本就要强的雷特自尊心受到了严重的打击 回到家里她就和莫迪大吵了一架 眼看两人的婚姻即将走到尽头 姨妈又出来横插一脚 她说莫迪多年前生下的孩子根本没死 而那个孩子也根本不是个畸形儿 那时候他们觉得莫迪没有抚养能力 于是就骗莫迪说把孩子埋了 其实是因为哥哥做生意赔了钱 把他的孩子卖到了富人家底下 莫迪听后伤心欲绝 姨妈的这番话成为了她感情破裂的罪魁祸首 回家的时候正好遇见来接她的雷特 一上车莫迪就和丈夫诉说自己的委屈 可本就气愤的雷特根本听不进去 甚至生出了没有莫迪自己会过的更好的想法 自从跟莫迪结婚后 她所承受的全是冷眼和讽刺 莫迪听后很是失望 她哭着跑下了车 赌气的雷特也扬长而去 无处可去的她只好来到山德拉这里 被伤透心的莫迪躺在床上迟迟无法入眠 她不想看见雷特 可她又害怕雷特真的离开自己 而另一边的雷特也同样备受煎熬 没有莫迪的日子 原本快乐的生活也失去了色彩 这次的离别让他们更清楚的意识到 对方在自己心目中的位置 看着床头莫迪画的结婚照 雷特再也控制不住对莫迪的思恋 第二天一早他就驱车找到莫迪 两人聊了很多 可以往不同的事 随应了一辈子的雷特 竟奇迹般对莫迪谈露心声 沉默流泪 声音像有些刺激 从没有开启锁门 刹那和寂静 这次的离别让他们更清楚的意识到 对方在自己心目中的位置 看着床头莫迪画的结婚照 原本快乐的生活也失去了色彩 第二天一早他就驱车找到莫迪 两个相爱的人终于解开了心结 回去的时候 雷特带莫迪来到一栋别墅门前 这是莫迪女儿生活的地方 当初那个被卖掉的小女孩 如今已经长成了黄花姑娘 看着就在眼前的女儿 莫迪却不敢过去相认 他害怕打扰到女儿如今的生活 在有生之年还能见到女儿 他就已经很知足了 随着年龄的增长 莫迪的关节炎越发严重 不听使唤的手再也握不住话 双腿也变得僵硬起来 没有雷特他甚至不能独自行走 他知道自己的时间不多 为了雷特在自己走后不再那么孤独 他让雷特养几条狗 这天夜里莫迪病情突然加重 雷特手忙脚乱的把他送到医院 虽然医生说不会有事的 但雷特似乎很清楚妻子的状况 他知道妻子可能要离开他了 看着病床上虚弱的妻子 这个一声要强的男人此刻哭红了眼 莫迪知道雷特比较嘴硬 在离开前 他替雷特说出了藏在内心深处的话 说完他便没了遗憾 带着那句你爱我永远离开的 相伴一生的男人 雷特走出医院 心中的护士让他不自觉地回头看了一眼 他多希望那个瘦瘦矮矮的女人 能再次挽起他的手", "language": "unknown", "provider": "gateway", "segments": [{"text": "女人患有严重的关节炎 在旁人眼里她就是个奇形怪物 哥哥因为经商失败 偷偷把母亲留给她的房子拿去了底盖 无处可去的她只能借住在姨妈家里 可时间一久 姨妈开始厌恶莫迪 她常常话里话外地催着莫迪离开 把她关在门外 莫迪再也忍受不了这种寄人篱下的屈辱 她来到贩卖店 准备在这里找份工作 这时一名渔夫走进店里 她要给自己招聘一个女佣人 等渔夫走后 她当机立断撕下墙上的招聘单 不步几公里来参加应聘 渔夫雷特从小在孤儿院长大 性格孤僻的她三十好几了 还没有一个像样的家 面对搜罗安小的莫迪 她张嘴就是嘲讽 我找到一个女人了 哇 我真是太幸运了 不管莫迪怎么捧吹自己 雷特还是毫不犹豫地拒绝了她 我还要回家 如果那女人再骂我一遍 谁骂谁 孩子们 他们不想听 他们不想听 我不在乎 有些人不喜欢 看她可怜 雷特把她送出了村子 两人分别后 雷特忍不住回头看了一眼 她不知道的是 在接下来的几个月 她会被这个一拳一拐的女人所折服 因为雷特在村里的名声很臭 在莫迪走后 基本没人过来应聘 雷特没有办法 无奈地她只能给莫迪一次机会 找到工作的莫迪很是激动 她赶紧跑回屋里收拾行李 准备迎接自己崭新的生活 即使面对姨妈的威胁 她也毫不犹豫地坐上了雷特的皮卡车 因为这是她出生以来第一次 做主自己的人生 但这里的工作 并不是她想象的那么轻松 不仅要伺候脾气暴躁的雇主 还要承担所有家务 刚来这里的莫迪 对屋子里的一切都充满了好奇 可这去被刚回家的雷特看好 她以为莫迪是在翻找自己的东西 莫迪连忙放下手里的东西 说自己做好了晚饭 雷特一看竟是自己最讨厌的萝卜汤 暴躁的脾气再也压制不住 她一边大吼着 一边摔着莫迪的东西 她需要的是一个可以照顾她的人 而不是等着她去照顾的残疾人 就这样莫迪被赶出了家门 可第二天一早 雷特就被一阵吵杂声吵醒 她疑惑的来到楼下 原来是莫迪正清理着地上的泥土 她并没有带着委屈离开这里 因为她已经没有地方可以去了 雷特见着没有说话 而是拿着莫迪做好的早餐出了门 这也算是一种默许吧 在这之后 雷特每天欲说而做日如而夕 莫迪就在家宰鸡做饭打理家务 虽然莫迪呆头呆脑 但她有着异于常人的绘画天赋 看着尘封已久的油漆 她灵机一动 把它涂在了生锈的储物沟上 这样原本色彩单调的房间 瞬间别有一番风味 等雷特工作回来 再端上一碗做好的鸡汤 雷特很满意莫迪的表现 可她的家里只有一张床 两人只能挤在一起睡觉 这让平时拘谨的莫迪十分难受 她彻夜未眠 但即使是这样 她也不想再过被姨妈施舍的生活了 姨妈觉得他们孤男寡女共处一室 败坏了家里的名声 对她一阵羞辱 可莫迪只是微微一笑 因为她清楚地知道 即使面对村子里的闲言碎语 也好过寄人篱下天天被人唾弃的生活 可这里并没有她想象的那么美好 只要她稍微不听话 就会遭到雷特的蠱打 而她又不敢反抗 每当受到委屈的时候 她就会拿起画笔 给家里添加几分色彩 看见这满屋子的鲜花野草 雷特嘴上虽然骂骂咧咧说糟蹋了房子 但心里却喜欢得不得了 她那古怪暴躁的性格 也在无形中被这些花花草草治愈着 这天一个富家小姐找上门 女人声称雷特欠了她三条鱼 莫迪小心翼翼回应说会帮她转达 无意间女人看到了屋里的花 她很喜欢 临走时女人询问了莫迪的名字 就这样莫迪交下了她人生中第一个朋友 而珊德拉也会成为她一生的贵人 等雷特回来后 莫迪将珊德拉上门要账的事情告诉了她 显然雷特已经把这件事情忘了 为了防止这样的事情再次发生 莫迪就用自己做的小卡片帮她记账 就这样莫迪成了雷特的搭档 他们的分工明确 雷特在前面卖鱼 莫迪就跟在后面记账 珊德拉很喜欢莫迪记账的小卡片 甚至愿意花钱连同卡片一起买下 莫迪不敢擅自做主 让她询问雷特的意见 最终雷特以十块钱的巨资 将卡片卖给了珊德拉 临走时 珊德拉还特意交代莫迪 多做一些这样的卡片 莫迪欣然答应 在这之后 画画变成了莫迪生活中的一部分 她画满了整个房间 楼梯上 侧镜上 还做了许多小卡片 雷特甚至主动给莫迪买了颜料 他们的感情越来越好 渐渐的莫迪的插画 成了他们收入来源的一部分 甚至有人花重金 只为购买一张莫迪制作的卡片 一时间莫迪名声大起 珊德拉更是直言想请她 专门给自己画画 可可珊德拉的老家因为远在隐约 考虑到雷特的感受 莫迪拒绝了 接着她表示想买一幅大一点的画 雷特听闻在角落里拿出几幅 但莫迪却不想这样 她不想把自己没画完的画卖出去 看出莫迪有些为难 她又赶紧打嘘地说 我不是故意的 我只是为了帮助你 我只是开玩笑的 这不是我说的 虽然不知道莫迪为什么会有钱不赚 但她还是会偏向莫迪的选择 他们虽然是主仆的关系 但远处一看更像是一对恩爱的夫妻 看着莫迪在每一幅画加上自己的名字 雷特虽然嘴硬 但心里却十分感动 她每天都会叮嘱莫迪不要忘了做家务 但说完她就拿起扫打宝屋子扫得干干净净 这天莫迪无意间提到了结婚的事情 雷特嘴上说着不愿意娶一个瘸子 可转头她就领着莫迪去教堂办理了结婚证 她已经深深地爱上了莫迪 虽然没有一场像样的婚礼 但莫迪却很满足 因为她嫁给了一个自己喜欢且喜欢自己的人 婚后他们整天黏在一起 莫迪的话也越卖越火爆 被当地的副总统发掘 她专门派记者登门采访莫迪 还用摄影机记录了生活状况 后来他们的爱情故事被全国播出 一时间他们风光无限 家里围满了参观购买的富家人士 可在这样耀眼的光环下 雷特却越来越自卑 因为她觉得能有这样的成就全是莫迪画画的功劳 而自己只是个渔夫 她害怕莫迪会丢下自己去找更好的人 恰好这天她又遇到了莫迪的姨妈 这让本就要强的雷特自尊心受到了严重的打击 回到家里她就和莫迪大吵了一架 眼看两人的婚姻即将走到尽头 姨妈又出来横插一脚 她说莫迪多年前生下的孩子根本没死 而那个孩子也根本不是个畸形儿 那时候他们觉得莫迪没有抚养能力 于是就骗莫迪说把孩子埋了 其实是因为哥哥做生意赔了钱 把他的孩子卖到了富人家底下 莫迪听后伤心欲绝 姨妈的这番话成为了她感情破裂的罪魁祸首 回家的时候正好遇见来接她的雷特 一上车莫迪就和丈夫诉说自己的委屈 可本就气愤的雷特根本听不进去 甚至生出了没有莫迪自己会过的更好的想法 自从跟莫迪结婚后 她所承受的全是冷眼和讽刺 莫迪听后很是失望 她哭着跑下了车 赌气的雷特也扬长而去 无处可去的她只好来到山德拉这里 被伤透心的莫迪躺在床上迟迟无法入眠 她不想看见雷特 可她又害怕雷特真的离开自己 而另一边的雷特也同样备受煎熬 没有莫迪的日子 原本快乐的生活也失去了色彩 这次的离别让他们更清楚的意识到 对方在自己心目中的位置 看着床头莫迪画的结婚照 雷特再也控制不住对莫迪的思恋 第二天一早他就驱车找到莫迪 两人聊了很多 可以往不同的事 随应了一辈子的雷特 竟奇迹般对莫迪谈露心声 沉默流泪 声音像有些刺激 从没有开启锁门 刹那和寂静 这次的离别让他们更清楚的意识到 对方在自己心目中的位置 看着床头莫迪画的结婚照 原本快乐的生活也失去了色彩 第二天一早他就驱车找到莫迪 两个相爱的人终于解开了心结 回去的时候 雷特带莫迪来到一栋别墅门前 这是莫迪女儿生活的地方 当初那个被卖掉的小女孩 如今已经长成了黄花姑娘 看着就在眼前的女儿 莫迪却不敢过去相认 他害怕打扰到女儿如今的生活 在有生之年还能见到女儿 他就已经很知足了 随着年龄的增长 莫迪的关节炎越发严重 不听使唤的手再也握不住话 双腿也变得僵硬起来 没有雷特他甚至不能独自行走 他知道自己的时间不多 为了雷特在自己走后不再那么孤独 他让雷特养几条狗 这天夜里莫迪病情突然加重 雷特手忙脚乱的把他送到医院 虽然医生说不会有事的 但雷特似乎很清楚妻子的状况 他知道妻子可能要离开他了 看着病床上虚弱的妻子 这个一声要强的男人此刻哭红了眼 莫迪知道雷特比较嘴硬 在离开前 他替雷特说出了藏在内心深处的话 说完他便没了遗憾 带着那句你爱我永远离开的 相伴一生的男人 雷特走出医院 心中的护士让他不自觉地回头看了一眼 他多希望那个瘦瘦矮矮的女人 能再次挽起他的手", "endSec": 414.79, "startSec": 0}], "durationSec": 414.79}	remix/cmrm7z1k2000i7k40cyzw5f5y/source-audio.mp3	2026-07-22 16:06:46.24	414.79	0.041479	{"model": "openai/gpt-5.6-luna", "version": 1, "fullText": "Người phụ nữ mắc bệnh viêm khớp nặng, trong mắt người khác, cô ấy giống như một con quái vật kỳ dị. Anh trai vì thất bại trong kinh doanh, đã âm thầm mang đi ngôi nhà mà mẹ để lại cho cô, khiến cô không có nơi nào để đi, chỉ biết ở nhờ nhà dì. Nhưng thời gian trôi qua, dì bắt đầu ghét Modi, thường xuyên nói bóng gió để đuổi cô đi và khóa cô ngoài cửa. Modi không thể chịu đựng thêm sự nhục nhã khi sống nhờ như vậy. Cô đến cửa hàng tìm việc. Lúc này, một ngư dân bước vào cửa hàng, cô ấy muốn tuyển một người hầu nữ. Sau khi ngư dân rời đi, cô lập tức xé tờ thông báo tuyển dụng trên tường, đi bộ vài km để tham gia phỏng vấn. Ngư dân Reyter lớn lên trong trại trẻ mồ côi, tính tình lập dị, hơn ba mươi tuổi mà vẫn chưa có một gia đình tử tế. Trước một Modi nhỏ bé, cô ta lập tức chế nhạo: 'Tôi đã tìm được một người phụ nữ! Wow, tôi thật sự may mắn. Mặc kệ Modi có nịnh nọt thế nào, Reyter vẫn từ chối không chút do dự. 'Tôi phải về nhà. Nếu mà cô ấy còn chửi tôi một lần nữa, thì ai chửi ai đây? Mấy đứa trẻ, chúng không muốn nghe. Chúng không muốn nghe. Tôi không quan tâm. Có một số người không thích, nhìn cô ấy thật tội nghiệp.' Reyter đã đuổi cô ra khỏi làng. Sau khi hai người chia tay, Reyter không thể không quay lại nhìn một lần. Cô không biết rằng trong vài tháng tới, cô sẽ bị chinh phục bởi người phụ nữ khập khiễng này. Bởi vì danh tiếng của Reyter trong làng rất tệ, sau khi Modi rời đi, hầu như không ai đến phỏng vấn. Reyter không còn cách nào khác, đành phải cho Modi một cơ hội. Khi tìm được việc, Modi vô cùng phấn khởi, cô lập tức quay về nhà thu dọn hành lý, chuẩn bị chào đón cuộc sống mới của mình. Ngay cả khi phải đối mặt với sự đe dọa của dì, cô cũng không do dự ngồi lên chiếc xe tải của Reyter. Bởi vì đây là lần đầu tiên trong đời cô làm chủ cuộc sống của mình. Nhưng công việc ở đây không dễ dàng như cô tưởng. Không chỉ phải phục vụ một ông chủ dễ tức giận, mà còn phải đảm nhận mọi việc nhà. Modi vừa đến đây, cô đã đầy tò mò về mọi thứ trong ngôi nhà. Nhưng Reyter vừa về tới nhà đã nhìn thấy. Cô ta nghĩ rằng Modi đang tìm đồ của mình. Modi lập tức đặt đồ xuống, nói mình đã nấu xong bữa tối. Reyter nhìn thấy là món canh củ cải mà mình ghét nhất, cơn giận không thể kiềm chế được, vừa gào thét vừa ném đồ của Modi. Cô cần một người có thể chăm sóc mình, chứ không phải một người tàn tật chờ cô chăm sóc. Thế là Modi bị đuổi ra khỏi nhà. Nhưng sáng hôm sau, Reyter bị đánh thức bởi tiếng động. Cô thắc mắc đi xuống dưới. Thì ra Modi đang dọn dẹp đất bẩn trên sàn. Cô không rời đi với sự uất ức, bởi vì cô không còn nơi nào để đi. Reyter thấy vậy không nói gì, mà cầm bữa sáng do Modi làm ra ngoài. Điều này cũng có thể xem là một sự ngầm thỏa thuận. Sau đó, mỗi ngày Reyter đều nói ít làm nhiều, Modi ở nhà giết gà nấu ăn và làm công việc nhà. Mặc dù Modi ngốc nghếch, nhưng cô có tài năng vẽ tranh khác thường. Nhìn thấy lọ sơn đã đóng bụi lâu ngày, cô nảy ra một ý tưởng, bôi nó lên rãnh chứa đồ ăn bị rỉ sét. Ngôi nhà vốn đơn điệu về màu sắc ngay lập tức trở nên sống động. Khi Reyter đi làm về, bưng lên một bát canh gà đã nấu xong, Reyter rất hài lòng với sự thể hiện của Modi. Nhưng trong nhà chỉ có một chiếc giường, hai người chỉ có thể chui vào cùng nhau ngủ. Điều này khiến Modi - người thường ngày nhút nhát cảm thấy rất khó chịu. Cô không ngủ được cả đêm, nhưng dù như vậy, cô cũng không muốn sống cuộc sống phụ thuộc dì nữa. Dì nghĩ rằng họ là đôi nam nữ cùng sống trong một phòng thì làm hỏng danh tiếng của gia đình, đã liên tục chế nhạo cô. Nhưng Modi chỉ cười nhẹ, vì cô biết rằng cho dù phải đối mặt với những lời bàn tán trong làng cũng tốt hơn là sống như một con người được người khác khinh miệt hàng ngày. Nhưng cuộc sống ở đây không hề như cô tưởng tượng. Chỉ cần cô không nghe lời một chút thôi, sẽ bị Reyter đánh. Và cô lại không dám chống cự. Mỗi khi cảm thấy uất ức, cô sẽ cầm cọ vẽ để thêm màu sắc cho cuộc sống trong nhà. Nhìn thấy cả ngôi nhà đầy hoa dại, Reyter tuy miệng mắng mỏ rằng cô đã làm hỏng nhà ở, nhưng trong lòng lại rất thích. Tính cách kỳ quặc và nóng nảy của cô cũng vô hình chung được những bông hoa này chữa lành. Hôm ấy, một cô gái nhà giàu đến tìm. Cô ta nói rằng Reyter nợ cô ba con cá. Modi cẩn thận đáp lại rằng sẽ chuyển lời giúp. Vô tình, cô gái nhìn thấy những bông hoa trong nhà, cô ta rất thích. Khi rời đi, cô gái đã hỏi tên của Modi. Cứ như vậy, Modi đã có người bạn đầu tiên trong đời và Shandra sẽ trở thành quý nhân của cô suốt đời. Khi Reyter về nhà, Modi đã kể cho cô về việc Shandra đến đòi nợ. Rõ ràng Reyter đã quên mất việc này. Để tránh những chuyện tương tự xảy ra lần nữa, Modi đã sử dụng những tấm thẻ nhỏ mình tự làm để ghi nhớ các khoản nợ. Cứ như vậy, Modi trở thành đối tác của Reyter, phân công công việc rõ ràng. Reyter ở trước bán cá, Modi theo sau ghi chép. Shandra rất thích những tấm thẻ ghi nợ của Modi, thậm chí sẵn sàng trả tiền để mua cả thẻ ghi nợ. Modi không dám tự quyết định, phải hỏi ý kiến của Reyter. Cuối cùng Reyter đã bán những tấm thẻ đó cho Shandra với giá 10 đồng. Khi ra về, Shandra còn đặc biệt dặn Modi làm thêm nhiều thẻ như vậy. Modi vui vẻ đồng ý. Sau đó, việc vẽ tranh trở thành một phần trong cuộc sống của Modi. Cô đã vẽ khắp cả căn phòng, trên cầu thang, trên gương, còn làm nhiều tấm thẻ nhỏ. Reyter thậm chí còn chủ động mua màu vẽ cho Modi, tình cảm của họ ngày càng tốt đẹp. Dần dần, những bức tranh minh họa của Modi đã trở thành một phần thu nhập của họ, thậm chí có người chịu bỏ tiền lớn chỉ để mua một tấm thẻ do Modi làm ra. Một thời gian ngắn, Modi nổi tiếng khắp nơi. Shandra thậm chí còn nói muốn thuê cô vẽ cho riêng mình. Tuy nhiên, quê của Shandra quá xa, xét thấy cảm nhận của Reyter, Modi đã từ chối. Sau đó, cô đề nghị muốn mua một bức tranh lớn hơn. Reyter làm nội ở góc phòng ra vài bức, nhưng Modi lại không muốn như vậy. Cô không muốn bán những bức tranh chưa vẽ xong của mình. Nhìn thấy Modi hơi khó xử, Reyter lập tức nói đùa: 'Tôi không có ý đó. Tôi chỉ muốn giúp cô thôi. Tôi chỉ đùa mà, không phải tôi nói đâu.' Mặc dù không biết tại sao Modi lại không kiếm tiền, nhưng cô vẫn nghiêng về quyết định của Modi. Dù họ có mối quan hệ dưới tư cách chủ và tớ, nhưng nếu nhìn từ xa thì lại giống như một cặp vợ chồng yêu nhau. Nhìn Modi viết tên mình lên mỗi bức tranh, Reyter dù miệng thì cứng rắn nhưng trong lòng lại rất cảm động. Hàng ngày, cô đều nhắc nhở Modi đừng quên làm việc nhà, nhưng ngay sau đó lại cầm chổi quét nhà cho sạch sẽ. Hôm ấy, Modi vô tình nhắc đến chuyện kết hôn, Reyter nói không muốn cưới một người bị tật. Nhưng ngay lập tức, cô đã dẫn Modi đến nhà thờ để làm giấy kết hôn. Cô đã yêu Modi say đắm. Dù không có một đám cưới hoành tráng, nhưng Modi rất hài lòng vì cô đã cưới được người mà mình thích và cũng thích mình. Sau khi kết hôn, họ ngày ngày quấn quít bên nhau, lời nói của Modi ngày càng có sức hút. Chính quyền địa phương đã phát hiện ra, cử phóng viên tới phỏng vấn Modi, còn ghi hình cuộc sống hằng ngày của cô. Sau đó, câu chuyện tình yêu của họ được phát sóng khắp cả nước. Một thời gian ngắn, họ trở nên rất nổi tiếng, nhà cửa đầy ắp người giàu có tới tham quan và mua sắm. Nhưng dưới ánh hào quang rực rỡ này, Reyter ngày càng cảm thấy tự ti. Cô cảm thấy những thành tựu này đều nhờ vào tài năng vẽ tranh của Modi, còn bản thân chỉ là một người ngư dân. Cô sợ Modi sẽ bỏ mình để đi tìm người khác tốt hơn. Vừa khéo hôm ấy, cô gặp lại dì của Modi, khiến lòng tự trọng của Reyter vốn đã nặng nề càng bị tổn thương. Về đến nhà, cô đã cãi vã với Modi một trận lớn. Nhìn thấy hôn nhân của họ sắp đi đến hồi kết, dì lại can thiệp. Bà nói rằng đứa trẻ mà Modi sinh ra nhiều năm trước không hề chết, và đứa trẻ đó cũng không phải là một đứa con dị dạng. Lúc đó, họ nghĩ rằng Modi không có khả năng nuôi dưỡng, nên đã lừa Modi rằng đã chôn đứa trẻ đi. Thực ra là vì anh trai đã làm ăn thua lỗ, đã bán đứa trẻ vào nhà giàu. Nghe vậy, Modi đau lòng tột độ. Những lời nói của dì trở thành nguyên nhân khiến cô và Reyter tan nát tình cảm. Khi trở về, đúng lúc gặp Reyter đến đón. Lên xe, Modi đã kể cho chồng về sự uất ức của mình. Nhưng Reyter đang tức giận nên không muốn nghe, thậm chí còn nảy ra suy nghĩ rằng nếu không có Modi, cô sẽ sống tốt hơn. Kể từ khi kết hôn với Modi, những gì cô phải đối mặt chỉ là cái nhìn lạnh nhạt và sự châm chọc. Nghe xong, Modi cảm thấy rất thất vọng, cô khóc chạy xuống xe. Reyter cũng giận dỗi rời đi. Không có nơi nào để đi, Modi chỉ đành tìm đến Sandra. Trái tim tổn thương của Modi nằm trên giường mà không thể ngủ được, cô không muốn gặp Reyter, nhưng lại sợ rằng Reyter sẽ thật sự rời xa mình. Mà ở phía bên kia, Reyter cũng đang chịu đựng sự dày vò. Những ngày không có Modi, cuộc sống vốn vui vẻ cũng mất đi màu sắc. Cuộc chia ly này khiến họ càng rõ ràng hơn về vị trí của đối phương trong lòng mình. Nhìn bức tranh cưới mà Modi vẽ trên đầu giường, Reyter không thể kiềm chế nỗi nhớ nhung dành cho Modi. Sáng hôm sau, cô lái xe đến tìm Modi. Hai người đã nói rất nhiều về những chuyện khác nhau. Reyter mà trước đó vốn luôn khép kín đã kỳ diệu mở lòng với Modi, trong im lặng có nước mắt, giọng nói có chút kích động, chưa từng mở cửa, vì khoảnh khắc ấy tĩnh lặng. Cuộc chia ly làm họ càng rõ ràng hơn về vị trí của nhau trong lòng, nhìn bức tranh cưới mà Modi vẽ, cuộc sống vốn vui vẻ cũng mất đi màu sắc. Sáng hôm sau, Reyter lại lái xe đến tìm Modi. Hai người yêu nhau cuối cùng cũng tháo gỡ được những khúc mắc trong lòng. Trên đường trở về, Reyter dẫn Modi đến trước một tòa biệt thự. Đây là nơi con gái của Modi đang sống. Cô bé khi xưa bị bán giờ đã lớn thành thiếu nữ xinh đẹp. Nhìn thấy con gái ở trước mặt, Modi lại không dám đến nhận. Cô sợ làm phiền đến cuộc sống hiện tại của con gái. Trong quãng đời còn lại có thể gặp lại con gái, cô đã rất mãn nguyện. Khi tuổi tác tăng lên, bệnh viêm khớp của Modi càng trở nên nghiêm trọng. Đôi tay không nghe lời nữa, không thể nắm giữ được đồ vật, còn đôi chân cũng trở nên cứng nhắc. Nếu không có Reyter, cô thậm chí không thể tự đi lại. Cô biết thời gian của mình không còn nhiều, để Reyter không còn cô đơn sau khi mình ra đi, cô đã bảo Reyter nuôi vài con chó. Đêm hôm đó, bệnh tình của Modi đột ngột trở nặng. Reyter hốt hoảng đưa cô đến bệnh viện. Mặc dù bác sĩ nói sẽ không có chuyện gì nghiêm trọng, nhưng Reyter dường như rất rõ tình trạng của vợ. Cô biết vợ có thể rời bỏ mình. Nhìn vợ nằm trên giường bệnh yếu ớt, người đàn ông vốn cứng rắn này lúc này đã khóc đỏ mắt. Modi biết Reyter khá cứng rắn. Trước khi ra đi, cô đã nói ra những điều nằm sâu trong lòng Reyter. Nói xong, cô không còn điều gì phải nuối tiếc, mang theo câu nói yêu em mãi mãi ra đi. Người đàn ông đã đồng hành cả đời với Modi. Reyter ra khỏi bệnh viện, ánh mắt của cô nhân viên y tế đã khiến cô không tự chủ được mà quay đầu lại nhìn. Cô rất mong người phụ nữ gầy gò thấp bé đó có thể nắm tay cô một lần nữa.", "language": "vi", "provider": "llm", "segments": [{"text": "Người phụ nữ mắc bệnh viêm khớp nặng, trong mắt người khác, cô ấy giống như một con quái vật kỳ dị. Anh trai vì thất bại trong kinh doanh, đã âm thầm mang đi ngôi nhà mà mẹ để lại cho cô, khiến cô không có nơi nào để đi, chỉ biết ở nhờ nhà dì. Nhưng thời gian trôi qua, dì bắt đầu ghét Modi, thường xuyên nói bóng gió để đuổi cô đi và khóa cô ngoài cửa. Modi không thể chịu đựng thêm sự nhục nhã khi sống nhờ như vậy. Cô đến cửa hàng tìm việc. Lúc này, một ngư dân bước vào cửa hàng, cô ấy muốn tuyển một người hầu nữ. Sau khi ngư dân rời đi, cô lập tức xé tờ thông báo tuyển dụng trên tường, đi bộ vài km để tham gia phỏng vấn. Ngư dân Reyter lớn lên trong trại trẻ mồ côi, tính tình lập dị, hơn ba mươi tuổi mà vẫn chưa có một gia đình tử tế. Trước một Modi nhỏ bé, cô ta lập tức chế nhạo: 'Tôi đã tìm được một người phụ nữ! Wow, tôi thật sự may mắn. Mặc kệ Modi có nịnh nọt thế nào, Reyter vẫn từ chối không chút do dự. 'Tôi phải về nhà. Nếu mà cô ấy còn chửi tôi một lần nữa, thì ai chửi ai đây? Mấy đứa trẻ, chúng không muốn nghe. Chúng không muốn nghe. Tôi không quan tâm. Có một số người không thích, nhìn cô ấy thật tội nghiệp.' Reyter đã đuổi cô ra khỏi làng. Sau khi hai người chia tay, Reyter không thể không quay lại nhìn một lần. Cô không biết rằng trong vài tháng tới, cô sẽ bị chinh phục bởi người phụ nữ khập khiễng này. Bởi vì danh tiếng của Reyter trong làng rất tệ, sau khi Modi rời đi, hầu như không ai đến phỏng vấn. Reyter không còn cách nào khác, đành phải cho Modi một cơ hội. Khi tìm được việc, Modi vô cùng phấn khởi, cô lập tức quay về nhà thu dọn hành lý, chuẩn bị chào đón cuộc sống mới của mình. Ngay cả khi phải đối mặt với sự đe dọa của dì, cô cũng không do dự ngồi lên chiếc xe tải của Reyter. Bởi vì đây là lần đầu tiên trong đời cô làm chủ cuộc sống của mình. Nhưng công việc ở đây không dễ dàng như cô tưởng. Không chỉ phải phục vụ một ông chủ dễ tức giận, mà còn phải đảm nhận mọi việc nhà. Modi vừa đến đây, cô đã đầy tò mò về mọi thứ trong ngôi nhà. Nhưng Reyter vừa về tới nhà đã nhìn thấy. Cô ta nghĩ rằng Modi đang tìm đồ của mình. Modi lập tức đặt đồ xuống, nói mình đã nấu xong bữa tối. Reyter nhìn thấy là món canh củ cải mà mình ghét nhất, cơn giận không thể kiềm chế được, vừa gào thét vừa ném đồ của Modi. Cô cần một người có thể chăm sóc mình, chứ không phải một người tàn tật chờ cô chăm sóc. Thế là Modi bị đuổi ra khỏi nhà. Nhưng sáng hôm sau, Reyter bị đánh thức bởi tiếng động. Cô thắc mắc đi xuống dưới. Thì ra Modi đang dọn dẹp đất bẩn trên sàn. Cô không rời đi với sự uất ức, bởi vì cô không còn nơi nào để đi. Reyter thấy vậy không nói gì, mà cầm bữa sáng do Modi làm ra ngoài. Điều này cũng có thể xem là một sự ngầm thỏa thuận. Sau đó, mỗi ngày Reyter đều nói ít làm nhiều, Modi ở nhà giết gà nấu ăn và làm công việc nhà. Mặc dù Modi ngốc nghếch, nhưng cô có tài năng vẽ tranh khác thường. Nhìn thấy lọ sơn đã đóng bụi lâu ngày, cô nảy ra một ý tưởng, bôi nó lên rãnh chứa đồ ăn bị rỉ sét. Ngôi nhà vốn đơn điệu về màu sắc ngay lập tức trở nên sống động. Khi Reyter đi làm về, bưng lên một bát canh gà đã nấu xong, Reyter rất hài lòng với sự thể hiện của Modi. Nhưng trong nhà chỉ có một chiếc giường, hai người chỉ có thể chui vào cùng nhau ngủ. Điều này khiến Modi - người thường ngày nhút nhát cảm thấy rất khó chịu. Cô không ngủ được cả đêm, nhưng dù như vậy, cô cũng không muốn sống cuộc sống phụ thuộc dì nữa. Dì nghĩ rằng họ là đôi nam nữ cùng sống trong một phòng thì làm hỏng danh tiếng của gia đình, đã liên tục chế nhạo cô. Nhưng Modi chỉ cười nhẹ, vì cô biết rằng cho dù phải đối mặt với những lời bàn tán trong làng cũng tốt hơn là sống như một con người được người khác khinh miệt hàng ngày. Nhưng cuộc sống ở đây không hề như cô tưởng tượng. Chỉ cần cô không nghe lời một chút thôi, sẽ bị Reyter đánh. Và cô lại không dám chống cự. Mỗi khi cảm thấy uất ức, cô sẽ cầm cọ vẽ để thêm màu sắc cho cuộc sống trong nhà. Nhìn thấy cả ngôi nhà đầy hoa dại, Reyter tuy miệng mắng mỏ rằng cô đã làm hỏng nhà ở, nhưng trong lòng lại rất thích. Tính cách kỳ quặc và nóng nảy của cô cũng vô hình chung được những bông hoa này chữa lành. Hôm ấy, một cô gái nhà giàu đến tìm. Cô ta nói rằng Reyter nợ cô ba con cá. Modi cẩn thận đáp lại rằng sẽ chuyển lời giúp. Vô tình, cô gái nhìn thấy những bông hoa trong nhà, cô ta rất thích. Khi rời đi, cô gái đã hỏi tên của Modi. Cứ như vậy, Modi đã có người bạn đầu tiên trong đời và Shandra sẽ trở thành quý nhân của cô suốt đời. Khi Reyter về nhà, Modi đã kể cho cô về việc Shandra đến đòi nợ. Rõ ràng Reyter đã quên mất việc này. Để tránh những chuyện tương tự xảy ra lần nữa, Modi đã sử dụng những tấm thẻ nhỏ mình tự làm để ghi nhớ các khoản nợ. Cứ như vậy, Modi trở thành đối tác của Reyter, phân công công việc rõ ràng. Reyter ở trước bán cá, Modi theo sau ghi chép. Shandra rất thích những tấm thẻ ghi nợ của Modi, thậm chí sẵn sàng trả tiền để mua cả thẻ ghi nợ. Modi không dám tự quyết định, phải hỏi ý kiến của Reyter. Cuối cùng Reyter đã bán những tấm thẻ đó cho Shandra với giá 10 đồng. Khi ra về, Shandra còn đặc biệt dặn Modi làm thêm nhiều thẻ như vậy. Modi vui vẻ đồng ý. Sau đó, việc vẽ tranh trở thành một phần trong cuộc sống của Modi. Cô đã vẽ khắp cả căn phòng, trên cầu thang, trên gương, còn làm nhiều tấm thẻ nhỏ. Reyter thậm chí còn chủ động mua màu vẽ cho Modi, tình cảm của họ ngày càng tốt đẹp. Dần dần, những bức tranh minh họa của Modi đã trở thành một phần thu nhập của họ, thậm chí có người chịu bỏ tiền lớn chỉ để mua một tấm thẻ do Modi làm ra. Một thời gian ngắn, Modi nổi tiếng khắp nơi. Shandra thậm chí còn nói muốn thuê cô vẽ cho riêng mình. Tuy nhiên, quê của Shandra quá xa, xét thấy cảm nhận của Reyter, Modi đã từ chối. Sau đó, cô đề nghị muốn mua một bức tranh lớn hơn. Reyter làm nội ở góc phòng ra vài bức, nhưng Modi lại không muốn như vậy. Cô không muốn bán những bức tranh chưa vẽ xong của mình. Nhìn thấy Modi hơi khó xử, Reyter lập tức nói đùa: 'Tôi không có ý đó. Tôi chỉ muốn giúp cô thôi. Tôi chỉ đùa mà, không phải tôi nói đâu.' Mặc dù không biết tại sao Modi lại không kiếm tiền, nhưng cô vẫn nghiêng về quyết định của Modi. Dù họ có mối quan hệ dưới tư cách chủ và tớ, nhưng nếu nhìn từ xa thì lại giống như một cặp vợ chồng yêu nhau. Nhìn Modi viết tên mình lên mỗi bức tranh, Reyter dù miệng thì cứng rắn nhưng trong lòng lại rất cảm động. Hàng ngày, cô đều nhắc nhở Modi đừng quên làm việc nhà, nhưng ngay sau đó lại cầm chổi quét nhà cho sạch sẽ. Hôm ấy, Modi vô tình nhắc đến chuyện kết hôn, Reyter nói không muốn cưới một người bị tật. Nhưng ngay lập tức, cô đã dẫn Modi đến nhà thờ để làm giấy kết hôn. Cô đã yêu Modi say đắm. Dù không có một đám cưới hoành tráng, nhưng Modi rất hài lòng vì cô đã cưới được người mà mình thích và cũng thích mình. Sau khi kết hôn, họ ngày ngày quấn quít bên nhau, lời nói của Modi ngày càng có sức hút. Chính quyền địa phương đã phát hiện ra, cử phóng viên tới phỏng vấn Modi, còn ghi hình cuộc sống hằng ngày của cô. Sau đó, câu chuyện tình yêu của họ được phát sóng khắp cả nước. Một thời gian ngắn, họ trở nên rất nổi tiếng, nhà cửa đầy ắp người giàu có tới tham quan và mua sắm. Nhưng dưới ánh hào quang rực rỡ này, Reyter ngày càng cảm thấy tự ti. Cô cảm thấy những thành tựu này đều nhờ vào tài năng vẽ tranh của Modi, còn bản thân chỉ là một người ngư dân. Cô sợ Modi sẽ bỏ mình để đi tìm người khác tốt hơn. Vừa khéo hôm ấy, cô gặp lại dì của Modi, khiến lòng tự trọng của Reyter vốn đã nặng nề càng bị tổn thương. Về đến nhà, cô đã cãi vã với Modi một trận lớn. Nhìn thấy hôn nhân của họ sắp đi đến hồi kết, dì lại can thiệp. Bà nói rằng đứa trẻ mà Modi sinh ra nhiều năm trước không hề chết, và đứa trẻ đó cũng không phải là một đứa con dị dạng. Lúc đó, họ nghĩ rằng Modi không có khả năng nuôi dưỡng, nên đã lừa Modi rằng đã chôn đứa trẻ đi. Thực ra là vì anh trai đã làm ăn thua lỗ, đã bán đứa trẻ vào nhà giàu. Nghe vậy, Modi đau lòng tột độ. Những lời nói của dì trở thành nguyên nhân khiến cô và Reyter tan nát tình cảm. Khi trở về, đúng lúc gặp Reyter đến đón. Lên xe, Modi đã kể cho chồng về sự uất ức của mình. Nhưng Reyter đang tức giận nên không muốn nghe, thậm chí còn nảy ra suy nghĩ rằng nếu không có Modi, cô sẽ sống tốt hơn. Kể từ khi kết hôn với Modi, những gì cô phải đối mặt chỉ là cái nhìn lạnh nhạt và sự châm chọc. Nghe xong, Modi cảm thấy rất thất vọng, cô khóc chạy xuống xe. Reyter cũng giận dỗi rời đi. Không có nơi nào để đi, Modi chỉ đành tìm đến Sandra. Trái tim tổn thương của Modi nằm trên giường mà không thể ngủ được, cô không muốn gặp Reyter, nhưng lại sợ rằng Reyter sẽ thật sự rời xa mình. Mà ở phía bên kia, Reyter cũng đang chịu đựng sự dày vò. Những ngày không có Modi, cuộc sống vốn vui vẻ cũng mất đi màu sắc. Cuộc chia ly này khiến họ càng rõ ràng hơn về vị trí của đối phương trong lòng mình. Nhìn bức tranh cưới mà Modi vẽ trên đầu giường, Reyter không thể kiềm chế nỗi nhớ nhung dành cho Modi. Sáng hôm sau, cô lái xe đến tìm Modi. Hai người đã nói rất nhiều về những chuyện khác nhau. Reyter mà trước đó vốn luôn khép kín đã kỳ diệu mở lòng với Modi, trong im lặng có nước mắt, giọng nói có chút kích động, chưa từng mở cửa, vì khoảnh khắc ấy tĩnh lặng. Cuộc chia ly làm họ càng rõ ràng hơn về vị trí của nhau trong lòng, nhìn bức tranh cưới mà Modi vẽ, cuộc sống vốn vui vẻ cũng mất đi màu sắc. Sáng hôm sau, Reyter lại lái xe đến tìm Modi. Hai người yêu nhau cuối cùng cũng tháo gỡ được những khúc mắc trong lòng. Trên đường trở về, Reyter dẫn Modi đến trước một tòa biệt thự. Đây là nơi con gái của Modi đang sống. Cô bé khi xưa bị bán giờ đã lớn thành thiếu nữ xinh đẹp. Nhìn thấy con gái ở trước mặt, Modi lại không dám đến nhận. Cô sợ làm phiền đến cuộc sống hiện tại của con gái. Trong quãng đời còn lại có thể gặp lại con gái, cô đã rất mãn nguyện. Khi tuổi tác tăng lên, bệnh viêm khớp của Modi càng trở nên nghiêm trọng. Đôi tay không nghe lời nữa, không thể nắm giữ được đồ vật, còn đôi chân cũng trở nên cứng nhắc. Nếu không có Reyter, cô thậm chí không thể tự đi lại. Cô biết thời gian của mình không còn nhiều, để Reyter không còn cô đơn sau khi mình ra đi, cô đã bảo Reyter nuôi vài con chó. Đêm hôm đó, bệnh tình của Modi đột ngột trở nặng. Reyter hốt hoảng đưa cô đến bệnh viện. Mặc dù bác sĩ nói sẽ không có chuyện gì nghiêm trọng, nhưng Reyter dường như rất rõ tình trạng của vợ. Cô biết vợ có thể rời bỏ mình. Nhìn vợ nằm trên giường bệnh yếu ớt, người đàn ông vốn cứng rắn này lúc này đã khóc đỏ mắt. Modi biết Reyter khá cứng rắn. Trước khi ra đi, cô đã nói ra những điều nằm sâu trong lòng Reyter. Nói xong, cô không còn điều gì phải nuối tiếc, mang theo câu nói yêu em mãi mãi ra đi. Người đàn ông đã đồng hành cả đời với Modi. Reyter ra khỏi bệnh viện, ánh mắt của cô nhân viên y tế đã khiến cô không tự chủ được mà quay đầu lại nhìn. Cô rất mong người phụ nữ gầy gò thấp bé đó có thể nắm tay cô một lần nữa.", "endSec": 414.79, "startSec": 0}], "durationSec": 414.79}
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: abilities abilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abilities
    ADD CONSTRAINT abilities_pkey PRIMARY KEY (id);


--
-- Name: arcs arcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: chapters chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: event_characters event_characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_characters
    ADD CONSTRAINT event_characters_pkey PRIMARY KEY (event_id, character_id, role);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: generation_outputs generation_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_outputs
    ADD CONSTRAINT generation_outputs_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: plot_signals plot_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plot_signals
    ADD CONSTRAINT plot_signals_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: source_items source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_items
    ADD CONSTRAINT source_items_pkey PRIMARY KEY (id);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: story_chunks story_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chunks
    ADD CONSTRAINT story_chunks_pkey PRIMARY KEY (id);


--
-- Name: timeline_entries timeline_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_pkey PRIMARY KEY (id);


--
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: viral_boards viral_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_boards
    ADD CONSTRAINT viral_boards_pkey PRIMARY KEY (id);


--
-- Name: viral_crawl_runs viral_crawl_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_crawl_runs
    ADD CONSTRAINT viral_crawl_runs_pkey PRIMARY KEY (id);


--
-- Name: viral_items viral_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_items
    ADD CONSTRAINT viral_items_pkey PRIMARY KEY (id);


--
-- Name: viral_remakes viral_remakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_remakes
    ADD CONSTRAINT viral_remakes_pkey PRIMARY KEY (id);


--
-- Name: abilities_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abilities_character_id_idx ON public.abilities USING btree (character_id);


--
-- Name: abilities_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abilities_story_id_idx ON public.abilities USING btree (story_id);


--
-- Name: arcs_story_id_order_index_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arcs_story_id_order_index_idx ON public.arcs USING btree (story_id, order_index);


--
-- Name: assets_generation_output_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_generation_output_id_idx ON public.assets USING btree (generation_output_id);


--
-- Name: assets_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_story_id_idx ON public.assets USING btree (story_id);


--
-- Name: chapters_story_id_content_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chapters_story_id_content_hash_key ON public.chapters USING btree (story_id, content_hash);


--
-- Name: chapters_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_story_id_idx ON public.chapters USING btree (story_id);


--
-- Name: chapters_story_id_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chapters_story_id_number_key ON public.chapters USING btree (story_id, number);


--
-- Name: characters_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_story_id_idx ON public.characters USING btree (story_id);


--
-- Name: characters_story_id_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_story_id_name_idx ON public.characters USING btree (story_id, name);


--
-- Name: event_characters_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_characters_character_id_idx ON public.event_characters USING btree (character_id);


--
-- Name: events_arc_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_arc_id_idx ON public.events USING btree (arc_id);


--
-- Name: events_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_chapter_id_idx ON public.events USING btree (chapter_id);


--
-- Name: events_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_story_id_idx ON public.events USING btree (story_id);


--
-- Name: generation_outputs_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX generation_outputs_chapter_id_idx ON public.generation_outputs USING btree (chapter_id);


--
-- Name: generation_outputs_story_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX generation_outputs_story_id_status_idx ON public.generation_outputs USING btree (story_id, status);


--
-- Name: generation_outputs_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX generation_outputs_type_idx ON public.generation_outputs USING btree (type);


--
-- Name: items_owner_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_owner_character_id_idx ON public.items USING btree (owner_character_id);


--
-- Name: items_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_story_id_idx ON public.items USING btree (story_id);


--
-- Name: jobs_status_priority_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_status_priority_created_at_idx ON public.jobs USING btree (status, priority, created_at);


--
-- Name: jobs_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_story_id_idx ON public.jobs USING btree (story_id);


--
-- Name: jobs_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_type_status_idx ON public.jobs USING btree (type, status);


--
-- Name: locations_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_story_id_idx ON public.locations USING btree (story_id);


--
-- Name: plot_signals_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plot_signals_chapter_id_idx ON public.plot_signals USING btree (chapter_id);


--
-- Name: plot_signals_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plot_signals_story_id_idx ON public.plot_signals USING btree (story_id);


--
-- Name: projects_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_slug_key ON public.projects USING btree (slug);


--
-- Name: prompt_templates_key_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_templates_key_active_idx ON public.prompt_templates USING btree (key, active);


--
-- Name: prompt_templates_key_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_templates_key_version_key ON public.prompt_templates USING btree (key, version);


--
-- Name: relationships_from_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_from_character_id_idx ON public.relationships USING btree (from_character_id);


--
-- Name: relationships_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_story_id_idx ON public.relationships USING btree (story_id);


--
-- Name: relationships_to_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationships_to_character_id_idx ON public.relationships USING btree (to_character_id);


--
-- Name: source_items_source_id_external_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX source_items_source_id_external_key_key ON public.source_items USING btree (source_id, external_key);


--
-- Name: source_items_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_items_source_id_idx ON public.source_items USING btree (source_id);


--
-- Name: sources_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sources_project_id_idx ON public.sources USING btree (project_id);


--
-- Name: stories_genre_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_genre_gin_idx ON public.stories USING gin (genre);


--
-- Name: stories_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_project_id_idx ON public.stories USING btree (project_id);


--
-- Name: stories_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_status_idx ON public.stories USING btree (status);


--
-- Name: stories_tags_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_tags_gin_idx ON public.stories USING gin (tags);


--
-- Name: story_chunks_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_chunks_chapter_id_idx ON public.story_chunks USING btree (chapter_id);


--
-- Name: story_chunks_chapter_id_ordinal_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_chunks_chapter_id_ordinal_key ON public.story_chunks USING btree (chapter_id, ordinal);


--
-- Name: story_chunks_embedding_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_chunks_embedding_hnsw_idx ON public.story_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: timeline_entries_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_entries_event_id_idx ON public.timeline_entries USING btree (event_id);


--
-- Name: timeline_entries_story_id_position_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timeline_entries_story_id_position_key ON public.timeline_entries USING btree (story_id, "position");


--
-- Name: usage_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_created_at_idx ON public.usage_events USING btree (created_at);


--
-- Name: usage_events_job_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_job_id_idx ON public.usage_events USING btree (job_id);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: viral_boards_project_id_board_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX viral_boards_project_id_board_key_key ON public.viral_boards USING btree (project_id, board_key);


--
-- Name: viral_boards_project_id_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_boards_project_id_enabled_idx ON public.viral_boards USING btree (project_id, enabled);


--
-- Name: viral_crawl_runs_board_id_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_crawl_runs_board_id_started_at_idx ON public.viral_crawl_runs USING btree (board_id, started_at);


--
-- Name: viral_items_board_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX viral_items_board_id_external_id_key ON public.viral_items USING btree (board_id, external_id);


--
-- Name: viral_items_board_id_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_items_board_id_tier_idx ON public.viral_items USING btree (board_id, tier);


--
-- Name: viral_items_board_id_trend_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_items_board_id_trend_score_idx ON public.viral_items USING btree (board_id, trend_score);


--
-- Name: viral_remakes_external_video_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_remakes_external_video_id_idx ON public.viral_remakes USING btree (external_video_id);


--
-- Name: viral_remakes_media_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_remakes_media_expires_at_idx ON public.viral_remakes USING btree (media_expires_at);


--
-- Name: viral_remakes_project_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_remakes_project_id_status_created_at_idx ON public.viral_remakes USING btree (project_id, status, created_at DESC);


--
-- Name: viral_remakes_viral_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viral_remakes_viral_item_id_idx ON public.viral_remakes USING btree (viral_item_id);


--
-- Name: abilities abilities_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abilities
    ADD CONSTRAINT abilities_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: abilities abilities_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abilities
    ADD CONSTRAINT abilities_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: arcs arcs_end_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_end_chapter_id_fkey FOREIGN KEY (end_chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: arcs arcs_start_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_start_chapter_id_fkey FOREIGN KEY (start_chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: arcs arcs_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assets assets_generation_output_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_generation_output_id_fkey FOREIGN KEY (generation_output_id) REFERENCES public.generation_outputs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assets assets_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chapters chapters_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: characters characters_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_characters event_characters_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_characters
    ADD CONSTRAINT event_characters_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_characters event_characters_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_characters
    ADD CONSTRAINT event_characters_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.arcs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: events events_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: generation_outputs generation_outputs_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_outputs
    ADD CONSTRAINT generation_outputs_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.arcs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: generation_outputs generation_outputs_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_outputs
    ADD CONSTRAINT generation_outputs_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: generation_outputs generation_outputs_prompt_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_outputs
    ADD CONSTRAINT generation_outputs_prompt_template_id_fkey FOREIGN KEY (prompt_template_id) REFERENCES public.prompt_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: generation_outputs generation_outputs_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generation_outputs
    ADD CONSTRAINT generation_outputs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: items items_owner_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_owner_character_id_fkey FOREIGN KEY (owner_character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: items items_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: jobs jobs_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: locations locations_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: plot_signals plot_signals_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plot_signals
    ADD CONSTRAINT plot_signals_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: plot_signals plot_signals_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plot_signals
    ADD CONSTRAINT plot_signals_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: relationships relationships_from_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_from_character_id_fkey FOREIGN KEY (from_character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: relationships relationships_since_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_since_chapter_id_fkey FOREIGN KEY (since_chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: relationships relationships_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: relationships relationships_to_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_to_character_id_fkey FOREIGN KEY (to_character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: source_items source_items_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_items
    ADD CONSTRAINT source_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sources sources_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stories stories_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stories stories_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: story_chunks story_chunks_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chunks
    ADD CONSTRAINT story_chunks_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: timeline_entries timeline_entries_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: timeline_entries timeline_entries_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_entries
    ADD CONSTRAINT timeline_entries_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usage_events usage_events_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: viral_boards viral_boards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_boards
    ADD CONSTRAINT viral_boards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: viral_crawl_runs viral_crawl_runs_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_crawl_runs
    ADD CONSTRAINT viral_crawl_runs_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.viral_boards(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: viral_items viral_items_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_items
    ADD CONSTRAINT viral_items_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.viral_boards(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: viral_remakes viral_remakes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_remakes
    ADD CONSTRAINT viral_remakes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: viral_remakes viral_remakes_viral_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viral_remakes
    ADD CONSTRAINT viral_remakes_viral_item_id_fkey FOREIGN KEY (viral_item_id) REFERENCES public.viral_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

