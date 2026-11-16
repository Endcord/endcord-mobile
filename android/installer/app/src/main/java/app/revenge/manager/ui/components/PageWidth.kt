package app.revenge.manager.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** As wide as a page's content gets: on a tablet or a phone on its side, lines and buttons stay at a size that reads */
val MAX_PAGE_WIDTH = 720.dp

/**
 * A page's content, at most [MAX_PAGE_WIDTH] wide and centered. Put after `verticalScroll`, so the page still scrolls
 * from anywhere on the screen, the sides included.
 */
fun Modifier.readableWidth(): Modifier = this
    .fillMaxWidth()
    .wrapContentWidth(Alignment.CenterHorizontally)
    .widthIn(max = MAX_PAGE_WIDTH)
