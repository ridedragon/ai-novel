#!/bin/bash

echo "Updating AI Novel Writer..."

# Clean dev-dist
if [ -d "dev-dist" ]; then
    echo "Cleaning temp files (dev-dist)..."
    rm -rf dev-dist
fi

# Set npm mirror
echo "Setting npm mirror..."
npm config set registry https://registry.npmmirror.com

# Pull from GitHub
echo "Pulling latest code from GitHub..."
if git pull; then
    echo "Code update successful!"
    
    # Update dependencies
    echo "Updating dependencies..."
    if npm install; then
        echo "Dependencies updated!"
        echo "Starting application..."
        ./start.sh
    else
        echo "Failed to update dependencies."
    fi
else
    echo "Update conflict."
    echo "This usually happens when local files were modified."
    
    # Get current branch
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    # Ask for force update
    read -p "Force update? This will lose all uncommitted changes [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Force resetting local repository..."
        
        if git fetch --all && git reset --hard origin/$BRANCH; then
            echo "Force reset successful."
            
            echo "Updating dependencies..."
            if npm install; then
                echo "Dependencies updated!"
                echo "Starting application..."
                ./start.sh
            else
                echo "Failed to update dependencies."
            fi
        else
            echo "Force reset failed."
        fi
    else
        echo "Update cancelled."
    fi
fi
