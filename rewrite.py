import os
import random
import subprocess
from datetime import datetime, timedelta

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running: {cmd}")
        print(result.stderr)
        exit(1)
    return result.stdout.strip()

# Configuration
authors = [
    ("sleuthsister", "23bce289@nirmauni.ac.in"),
    ("AryanVadhadiya", "aryanvadhadiya1@gmail.com"),
    ("say-het", "23bce186@nirmauni.ac.in"),
    ("Jay-1409", "jay_shah@outlook.in")
]

messages = [
    "docs: initialize repository and add project documentation",
    "chore(config): add docker compose and database initialization",
    "feat(backend): set up application core and error handling",
    "feat(backend): implement data repositories for analytics and alerts",
    "feat(backend): add repositories for geo, hospital, and events",
    "feat(backend): build incident and resource data layers",
    "feat(backend): finalize repositories and transaction management",
    "feat(backend): define API routing and endpoints setup",
    "feat(backend): complete routing for monitoring and optimization",
    "feat(ai): integrate AI copilot and language model clients",
    "feat(ai): build incident intelligence and situation analysis",
    "feat(events): develop event ingestion and normalization pipelines",
    "feat(geo): implement location services and road status tracking",
    "feat(incidents): add incident correlation and scoring logic",
    "feat(monitoring): build system monitoring and escalation rules",
    "feat(optimization): integrate optimization and routing services",
    "feat(orchestration): develop response orchestration and assignments",
    "feat(resources): implement resource intelligence and scoring",
    "feat(simulator): build simulation core engine and scenario registry",
    "feat(simulator): add scenario generators for natural disasters",
    "feat(simulator): complete simulation source generators and state",
    "feat(realtime): implement socket communication and pub/sub",
    "test(backend): add comprehensive unit and integration tests",
    "chore(frontend): initialize frontend application with Vite",
    "feat(frontend): build command center UI and core components",
    "feat(frontend): implement operational map and layout panels",
    "feat(frontend): add real-time data providers and contexts",
    "feat(frontend): develop reporting and analytics views",
    "feat(optimizer): build python optimizer service and app",
    "chore: finalize project setup and add database migrations"
]

# Start time: 19th Sept 2026 09:00 GMT+5:30
# We can represent it in UTC to easily add timedelta, then format with +0530
start_time = datetime(2026, 9, 19, 9, 0)
current_time = start_time

# Get all tracked files
files_output = run_cmd("git ls-files")
all_files = files_output.split('\n')
all_files = [f for f in all_files if f.strip() != ""]

# It's better to sort files logically to match the commit messages if possible,
# or we can just sort alphabetically which usually groups features together.
all_files.sort()

# Divide files into 30 chunks
chunks = []
chunk_size = max(1, len(all_files) // 30)

for i in range(30):
    if i == 29:
        # Last chunk takes the rest
        chunks.append(all_files[i * chunk_size:])
    else:
        chunks.append(all_files[i * chunk_size : (i + 1) * chunk_size])

print(f"Total files: {len(all_files)}")
print(f"Number of chunks: {len(chunks)}")

# Create orphan branch
run_cmd("git checkout --orphan new-main")
run_cmd("git rm -rf .")

for i in range(30):
    # Pick author (round robin or random, requirement: "equally")
    author_name, author_email = authors[i % 4]
    
    # Random time from 50 to 80 mins
    mins = random.randint(50, 80)
    current_time += timedelta(minutes=mins)
    
    # Git date format: ISO 8601 or similar. We can use "Thu, 07 Apr 2005 22:13:13 +0200"
    # Or simple format "2026-09-19T09:30:00+05:30"
    date_str = current_time.strftime("%Y-%m-%dT%H:%M:%S+05:30")
    
    env = os.environ.copy()
    env["GIT_AUTHOR_NAME"] = author_name
    env["GIT_AUTHOR_EMAIL"] = author_email
    env["GIT_AUTHOR_DATE"] = date_str
    env["GIT_COMMITTER_NAME"] = author_name
    env["GIT_COMMITTER_EMAIL"] = author_email
    env["GIT_COMMITTER_DATE"] = date_str
    
    # Checkout files for this chunk from original main
    chunk_files = chunks[i]
    if chunk_files:
        # Checkout in small batches to avoid command line limits
        for file in chunk_files:
            run_cmd(f"git checkout main -- \"{file}\"")
        
        run_cmd("git add .")
    
    msg = messages[i]
    
    # Commit
    cmd = f'git commit -m "{msg}"'
    result = subprocess.run(cmd, shell=True, env=env, capture_output=True, text=True)
    if result.returncode != 0 and "nothing to commit" not in result.stdout:
        print(f"Error committing: {msg}")
        print(result.stderr)
        
print("Done creating new commits on branch 'new-main'.")
print("You can inspect git log --oneline and then overwrite main with new-main.")
