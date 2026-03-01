from pydantic import BaseModel, model_validator
from typing import Optional

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str
    remember_me: bool = False
    
    @model_validator(mode='after')
    def validate_identifier(self):
        """Validate that either email or username is provided"""
        # Convert empty strings to None
        if self.email == "":
            self.email = None
        if self.username == "":
            self.username = None
        
        # Check that at least one is provided
        if not self.email and not self.username:
            raise ValueError("Either email or username must be provided")
        
        return self