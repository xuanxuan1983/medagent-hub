import os
import base64
import requests
import json

# List of files to update
files_to_update = [
    "aesthetic-designer.md",
    "area-manager.md",
    "channel-manager.md",
    "creative-director.md",
    "finance-bp.md",
    "gtm-strategist.md",
    "hrbp.md",
    "marketing-director.md",
    "material-architect.md",
    "medical-liaison.md",
    "new-media-director.md",
    "postop-specialist.md",
    "procurement-manager.md",
    "product-strategist.md",
    "sales-director.md",
    "sfe-director.md",
    "sparring-partner.md",
    "senior-consultant.md"
]

# GitHub repository information
repo_owner = "xuanxuan1983"
repo_name = "medagent-hub"
repo_path = "skills"
github_token = "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"

# Function to update a file on GitHub
def update_github_file(filename):
    try:
        # Read the local file content
        with open(f"/home/ubuntu/medagent-hub/skills/{filename}", "r") as f:
            content = f.read()

        # Encode the content in base64
        content_base64 = base64.b64encode(content.encode()).decode()

        # Get the SHA of the file
        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{repo_path}/{filename}"
        headers = {"Authorization": f"token {github_token}"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # Raise an exception for bad status codes
        sha = response.json()["sha"]

        # Create the JSON payload
        payload = {
            "message": f"Update skill: {filename}",
            "content": content_base64,
            "sha": sha
        }

        # Make the PUT request to update the file
        response = requests.put(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()

        print(f"Successfully updated {filename} on GitHub.")

    except requests.exceptions.RequestException as e:
        print(f"Error updating {filename}: {e}")
    except Exception as e:
        print(f"An unexpected error occurred while updating {filename}: {e}")

# Loop through the files and update them
for filename in files_to_update:
    update_github_file(filename)

print("All skill files have been processed.")
