from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    preferredModel: str | None = None


class SessionSourceAttach(BaseModel):
    sourceId: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "spar"
    model: str
    selection: str | None = None
    chunkId: str | None = None
