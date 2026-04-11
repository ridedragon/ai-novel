#!/bin/bash

# Colors
RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
NC=\033[0m # No Color

echo -e "${YELLOW}Updating AI Novel Writer...${NC}"

# Clean dev-dist
if [ -d "dev-dist" ]; then
    echo -e "Cleaning temp files (dev-dist)..."
    rm -rf dev-dist
fi

# Set npm mirror
echo -e "${YELLOW}Setting npm mirror...${NC}"
npm config set registry https://registry.npmmirror.com

# Pull from GitHub
echo -e "${YELLOW}Pulling latest code from GitHub...${NC}"
if git pull; then
    echo -e "${GREEN}Code update successful!${NC}"
    
    # Update dependencies
    echo -e "${YELLOW}Updating dependencies...${NC}"
    if npm install; then
        echo -e "${GREEN}Dependencies updated!${NC}"
        echo -e "${YELLOW}Starting application...${NC}"
        ./start.sh
    else
        echo -e "${RED}Failed to update dependencies.${NC}"
    fi
else
    echo -e "${RED}Update conflict.${NC}"
    echo -e "This usually happens when local files were modified."
    
    # Get current branch
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    # Ask for force update
    read -p "Force update? This will lose all uncommitted changes [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Force resetting local repository...${NC}"
        
        if git fetch --all && git reset --hard origin/$BRANCH; then
            echo -e "${GREEN}Force reset successful.${NC}"
            
            echo -e "${YELLOW}Updating dependencies...${NC}"
            if npm install; then
                echo -e "${GREEN}Dependencies updated!${NC}"
                echo -e "${YELLOW}Starting application...${NC}"
                ./start.sh
            else
                echo -e "${RED}Failed to update dependencies.${NC}"
            fi
        else
            echo -e "${RED}Force reset failed.${NC}"
        fi
    else
        echo -e "${YELLOW}Update cancelled.${NC}"
    fi
fi
