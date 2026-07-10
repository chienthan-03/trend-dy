import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateViralBoardDto } from "./dto/create-viral-board.dto";
import { UpdateViralBoardDto } from "./dto/update-viral-board.dto";
import { UpdateViralItemDto } from "./dto/update-viral-item.dto";
import { ViralService } from "./viral.service";

@Controller("viral")
@UseGuards(SessionAuthGuard)
export class ViralController {
  constructor(private readonly viralService: ViralService) {}

  @Get("boards")
  listBoards(@Query("projectId") projectId?: string) {
    return this.viralService.listBoards(projectId);
  }

  @Post("boards")
  createBoard(@Body() body: CreateViralBoardDto) {
    return this.viralService.createBoard(body);
  }

  @Get("boards/:id")
  findBoard(@Param("id") id: string) {
    return this.viralService.findBoardById(id);
  }

  @Patch("boards/:id")
  updateBoard(@Param("id") id: string, @Body() body: UpdateViralBoardDto) {
    return this.viralService.updateBoard(id, body);
  }

  @Post("boards/:id/crawl")
  triggerCrawl(@Param("id") id: string) {
    return this.viralService.triggerCrawl(id);
  }

  @Get("items")
  listItems(
    @Query("boardId") boardId?: string,
    @Query("genre") genre?: string,
    @Query("tier") tier?: string,
    @Query("hashtag") hashtag?: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.viralService.listItems({
      boardId,
      genre,
      tier,
      hashtag,
      projectId,
    });
  }

  @Get("items/:id")
  findItem(@Param("id") id: string) {
    return this.viralService.findItemById(id);
  }

  @Patch("items/:id")
  updateItem(@Param("id") id: string, @Body() body: UpdateViralItemDto) {
    return this.viralService.updateItem(id, body);
  }

  @Get("genres/top")
  getTopGenres(@Query("projectId") projectId?: string) {
    return this.viralService.getTopGenres(projectId);
  }

  @Get("crawl-runs")
  listCrawlRuns(@Query("boardId") boardId?: string) {
    return this.viralService.listCrawlRuns(boardId);
  }
}
